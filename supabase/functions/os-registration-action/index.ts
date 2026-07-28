import Stripe from "npm:stripe@18.5.0";
import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const resendKey = Deno.env.get("RESEND_API_KEY");
const confirmationFrom = Deno.env.get("RESEND_FROM_EMAIL");
const stripe = stripeKey ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() }) : null;

const inviteNext = async (admin: ReturnType<typeof adminClient>, tierId: string, eventName: string) => {
  const { data: next } = await admin.from("os_waitlist").select("*")
    .eq("tier_id", tierId).eq("status", "waiting").order("created_at").limit(1).maybeSingle();
  if (!next) return;
  await admin.from("os_waitlist").update({ status: "invited", invited_at: new Date().toISOString() }).eq("id", next.id);
  if (resendKey && confirmationFrom) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: confirmationFrom, to: [next.email],
        subject: `A spot opened for ${eventName}`,
        html: `<p>Hi ${next.first_name}, a registration spot has opened for <strong>${eventName}</strong>.</p><p>Visit OpenStart to register. Availability is first-come, first-served.</p>`,
      }),
    }).catch(() => null);
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if(!await enforceRateLimit(request,"registration-action",60,300)) return json(request,{error:"Too many requests. Try again shortly."},429);
  try {
    const user = await requiredUser(request);
    if (!user) return json(request, { error: "Sign in is required" }, 401);
    const body = await request.json();
    const action = String(body.action || "");
    const admin = adminClient();

    if (action === "accept_transfer") {
      const { data: registration, error } = await admin.from("os_registrations")
        .select("*, os_events!inner(allow_transfers,transfers_close_at)")
        .eq("transfer_token", body.token).maybeSingle();
      if (error) throw error;
      if (!registration || !registration.transfer_expires_at || new Date(registration.transfer_expires_at) <= new Date()) {
        throw new Error("This transfer link is invalid or expired");
      }
      const race = registration.os_events as unknown as Record<string, unknown>;
      if (!race.allow_transfers || (race.transfers_close_at && new Date(String(race.transfers_close_at)) <= new Date())) {
        throw new Error("Transfers are closed");
      }
      const { error: updateError } = await admin.from("os_registrations").update({
        participant_user_id: user.id, email: user.email,
        first_name: String(body.firstName || "").trim().slice(0, 100),
        last_name: String(body.lastName || "").trim().slice(0, 100),
        emergency_contact: String(body.emergencyContact || "").trim().slice(0, 300),
        transfer_token: null, transfer_expires_at: null, confirmation_email_sent_at: null,
      }).eq("id", registration.id);
      if (updateError) throw updateError;
      await admin.rpc("os_log_registration_activity", {
        p_registration_id: registration.id, p_actor_user_id: user.id,
        p_action: "transfer_accepted", p_details: { new_email: user.email },
      });
      return json(request, { ok: true });
    }

    const { data: registration, error } = await admin.from("os_registrations")
      .select("*, os_events!inner(name,organizer_id,participant_edits_close_at,transfers_close_at,refunds_close_at,allow_transfers,allow_refund_requests)")
      .eq("id", body.registrationId).maybeSingle();
    if (error) throw error;
    if (!registration) throw new Error("Registration was not found");
    const race = registration.os_events as unknown as Record<string, unknown>;
    const isRunner = registration.participant_user_id === user.id;
    const isOrganizer = race.organizer_id === user.id;

    if (action === "runner_update") {
      if (!isRunner) return json(request, { error: "You cannot edit this registration" }, 403);
      if (race.participant_edits_close_at && new Date(String(race.participant_edits_close_at)) <= new Date()) throw new Error("Participant edits are closed");
      const changes = {
        first_name: String(body.firstName || "").trim().slice(0, 100),
        last_name: String(body.lastName || "").trim().slice(0, 100),
        emergency_contact: String(body.emergencyContact || "").trim().slice(0, 300),
      };
      if (!changes.first_name || !changes.last_name || !changes.emergency_contact) throw new Error("All participant fields are required");
      const { error: updateError } = await admin.from("os_registrations").update(changes).eq("id", registration.id);
      if (updateError) throw updateError;
      await admin.rpc("os_log_registration_activity", { p_registration_id: registration.id, p_actor_user_id: user.id, p_action: "participant_updated", p_details: {} });
      return json(request, { ok: true });
    }

    if (action === "request_cancel") {
      if (!isRunner) return json(request, { error: "You cannot cancel this registration" }, 403);
      if (!race.allow_refund_requests) throw new Error("Cancellation requests are disabled");
      if (race.refunds_close_at && new Date(String(race.refunds_close_at)) <= new Date()) throw new Error("The cancellation deadline has passed");
      if (registration.status !== "confirmed") throw new Error("This registration cannot be cancelled");
      await admin.from("os_registrations").update({ status: "cancel_requested", refund_requested_at: new Date().toISOString() }).eq("id", registration.id);
      await admin.rpc("os_log_registration_activity", { p_registration_id: registration.id, p_actor_user_id: user.id, p_action: "cancellation_requested", p_details: {} });
      return json(request, { ok: true });
    }

    if (action === "create_transfer") {
      if (!isRunner) return json(request, { error: "You cannot transfer this registration" }, 403);
      if (!race.allow_transfers || registration.status !== "confirmed") throw new Error("This registration cannot be transferred");
      if (race.transfers_close_at && new Date(String(race.transfers_close_at)) <= new Date()) throw new Error("Transfers are closed");
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      await admin.from("os_registrations").update({ transfer_token: token, transfer_expires_at: expires }).eq("id", registration.id);
      await admin.rpc("os_log_registration_activity", { p_registration_id: registration.id, p_actor_user_id: user.id, p_action: "transfer_created", p_details: { expires_at: expires } });
      return json(request, { ok: true, token, expiresAt: expires });
    }

    if (action === "organizer_cancel" || action === "organizer_refund") {
      if (!isOrganizer) return json(request, { error: "You cannot manage this registration" }, 403);
      let refundId: string | null = null;
      if (action === "organizer_refund" && registration.payment_status === "paid") {
        if (!stripe || !registration.stripe_payment_intent_id) throw new Error("Stripe refund information is unavailable");
        const refund = await stripe.refunds.create({
          payment_intent: registration.stripe_payment_intent_id,
          amount: registration.amount_cents,
          refund_application_fee: true, reverse_transfer: true,
          metadata: { openstart_registration_id: registration.id },
        }, { idempotencyKey: `openstart-refund-${registration.id}` });
        refundId = refund.id;
      }
      await admin.from("os_registrations").update({
        status: "cancelled",
        payment_status: refundId ? "refunded" : registration.payment_status,
        stripe_refund_id: refundId,
        refunded_at: refundId ? new Date().toISOString() : null,
      }).eq("id", registration.id);
      if (registration.order_id && refundId) {
        const { count: remaining } = await admin.from("os_registrations")
          .select("id", { count: "exact", head: true }).eq("order_id", registration.order_id)
          .eq("payment_status", "paid").neq("id", registration.id);
        await admin.from("os_orders").update({ status: remaining ? "partially_refunded" : "refunded" })
          .eq("id", registration.order_id);
      }
      await admin.rpc("os_log_registration_activity", { p_registration_id: registration.id, p_actor_user_id: user.id, p_action: refundId ? "refunded" : "cancelled", p_details: { stripe_refund_id: refundId } });
      await inviteNext(admin, registration.tier_id, String(race.name));
      return json(request, { ok: true, refunded: Boolean(refundId) });
    }
    return json(request, { error: "Unknown registration action" }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Registration action failed" }, 400);
  }
});
