import Stripe from "npm:stripe@18.5.0";
import QRCode from "npm:qrcode@1.5.4";
import { adminClient, json, recordFunctionError } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const resendKey = Deno.env.get("RESEND_API_KEY");
const confirmationFrom = Deno.env.get("RESEND_FROM_EMAIL");
const raceDaySigningSecret = Deno.env.get("RACE_DAY_SIGNING_SECRET");
const stripe = stripeKey
  ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() })
  : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const raceDayToken = async (registrationId: string, startsAt: string) => {
  if (!raceDaySigningSecret) return null;
  const payload = encode(new TextEncoder().encode(JSON.stringify({
    registrationId, expiresAt: new Date(startsAt).getTime() + 7 * 86400000,
  })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(raceDaySigningSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  return `${payload}.${signature}`;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);

const sendConfirmationEmail = async (
  admin: ReturnType<typeof adminClient>,
  registrationId: string,
) => {
  if (!resendKey || !confirmationFrom) {
    console.log("Registration email skipped because Resend is not configured");
    return;
  }

  const { data: registration, error } = await admin
    .from("os_registrations")
    .select("id, email, first_name, amount_cents, confirmation_email_sent_at, os_events(name, starts_at, location_name), os_event_tiers(name, distance_label)")
    .eq("id", registrationId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (error) throw error;
  if (!registration || registration.confirmation_email_sent_at) return;

  const race = registration.os_events as unknown as Record<string, unknown>;
  const tier = registration.os_event_tiers as unknown as Record<string, unknown>;
  const token = await raceDayToken(registration.id, String(race?.starts_at));
  const qrData = token ? await QRCode.toDataURL(token, { width: 320, margin: 1 }) : null;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `openstart-registration-${registrationId}`,
      "User-Agent": "OpenStart/1.0",
    },
    body: JSON.stringify({
      from: confirmationFrom,
      to: [registration.email],
      subject: `Registration confirmed: ${race?.name || "your race"}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17211d">
        <h1 style="color:#0f6b4f">You're on the starting line.</h1>
        <p>Hi ${escapeHtml(registration.first_name)}, your registration and payment are confirmed.</p>
        <h2>${escapeHtml(race?.name)}</h2>
        <p>${escapeHtml(tier?.name)} · ${escapeHtml(tier?.distance_label)}</p>
        <p>${escapeHtml(race?.location_name)} · ${escapeHtml(new Date(String(race?.starts_at)).toLocaleDateString("en-US", { dateStyle: "long" }))}</p>
        <p><strong>Registration ID:</strong> ${escapeHtml(registration.id)}</p>
        ${qrData ? '<p><strong>Your race-day pass</strong></p><img src="cid:openstart-pass" width="240" height="240" alt="OpenStart QR pass">' : ""}
        <p style="margin-top:32px">See you at the start,<br><strong>OpenStart</strong></p>
      </div>`,
      attachments: qrData ? [{
        filename: "openstart-race-day-pass.png",
        content: qrData.split(",")[1],
        content_id: "openstart-pass",
      }] : undefined,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Confirmation email failed");

  const { error: updateError } = await admin
    .from("os_registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", registrationId)
    .is("confirmation_email_sent_at", null);
  if (updateError) throw updateError;
};

// A failed confirmation email must not fail the webhook: the payment is already
// recorded, and returning non-2xx would make Stripe retry the whole delivery.
// sendConfirmationEmail is idempotent (guarded by confirmation_email_sent_at),
// so a later successful delivery still fills the gap.
const emailQuietly = async (
  admin: ReturnType<typeof adminClient>,
  registrationId: string,
) => {
  try {
    await sendConfirmationEmail(admin, registrationId);
  } catch (emailError) {
    console.error(
      "Confirmation email failed",
      registrationId,
      emailError instanceof Error ? emailError.message : emailError,
    );
  }
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!stripe || !webhookSecret) return json(request, { error: "Stripe webhook is not configured" }, 503);

  const admin = adminClient();
  let providerEventId: string | null = null;
  let providerEventType = "signature_verification";
  try {
    const signature = request.headers.get("Stripe-Signature");
    if (!signature) return json(request, { error: "Missing Stripe signature" }, 400);
    const payload = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      payload, signature, webhookSecret, undefined, cryptoProvider,
    );
    providerEventId=event.id;
    providerEventType=event.type;
    const { data: priorEvent } = await admin.from("os_provider_events")
      .select("status").eq("provider","stripe").eq("provider_event_id",event.id).maybeSingle();
    if (priorEvent?.status === "processed") return json(request, { received: true });
    await admin.from("os_provider_events").upsert({
      provider:"stripe",provider_event_id:event.id,event_type:event.type,status:"processing",
      received_at:new Date().toISOString(),
    },{onConflict:"provider,provider_event_id"});
    let handled=false;

    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      handled=true;
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.openstart_registration_id;
      const orderId = session.metadata?.openstart_order_id;
      if (orderId && session.payment_status === "paid") {
        await admin.from("os_orders").update({
          status: "paid", stripe_payment_intent_id: String(session.payment_intent || ""), paid_at: new Date().toISOString(),
        }).eq("id", orderId).neq("status", "paid");
        await admin.from("os_registrations").update({
          status: "confirmed", payment_status: "paid",
          stripe_payment_intent_id: String(session.payment_intent || ""), reservation_expires_at: null,
        }).eq("order_id", orderId).neq("payment_status", "paid");
        // Email every confirmed registration in the order, not just the rows the
        // update touched — on a Stripe retry those are already paid (0 rows), so
        // scoping to them would permanently drop any email the first pass missed.
        const { data: orderRegistrations } = await admin.from("os_registrations")
          .select("id").eq("order_id", orderId).eq("status", "confirmed");
        for (const registration of orderRegistrations || []) await emailQuietly(admin, registration.id);
      }
      if (registrationId && session.payment_status === "paid") {
        await admin.from("os_registrations").update({
          status: "confirmed",
          payment_status: "paid",
          stripe_payment_intent_id: String(session.payment_intent || ""),
          reservation_expires_at: null,
        }).eq("id", registrationId).neq("payment_status", "paid");
        if(session.metadata?.openstart_lottery_application_id){
          await admin.rpc("os_confirm_lottery_registration",{p_registration_id:registrationId});
        }
        await emailQuietly(admin, registrationId);
      }
    }

    if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
      handled=true;
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.openstart_registration_id;
      const orderId = session.metadata?.openstart_order_id;
      if (orderId) {
        await admin.from("os_orders").update({ status: "expired" }).eq("id", orderId).eq("status", "reserved");
        await admin.from("os_registrations").update({ status: "expired", payment_status: "failed" })
          .eq("order_id", orderId).in("status", ["reserved", "pending"]);
      }
      if (registrationId) {
        await admin.from("os_registrations").update({
          status: "expired",
          payment_status: "failed",
        }).eq("id", registrationId).in("status", ["reserved", "pending"]);
      }
    }

    if (event.type === "account.updated") {
      handled=true;
      const account = event.data.object as Stripe.Account;
      await admin.from("os_profiles").update({
        stripe_details_submitted: account.details_submitted,
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
      }).eq("stripe_account_id", account.id);
    }

    await admin.from("os_provider_events").update({
      status:handled ? "processed" : "ignored",processed_at:new Date().toISOString(),error_message:null,
    }).eq("provider","stripe").eq("provider_event_id",event.id);
    return json(request, { received: true });
  } catch (error) {
    await recordFunctionError("os-stripe-webhook",error);
    await admin.from("os_provider_events").upsert({
      provider:"stripe",provider_event_id:providerEventId,event_type:providerEventType,status:"failed",
      error_message:error instanceof Error ? error.message.slice(0,500) : "Webhook failed",
      processed_at:new Date().toISOString(),
    },providerEventId ? {onConflict:"provider,provider_event_id"} : undefined).catch(()=>null);
    return json(request, { error: error instanceof Error ? error.message : "Webhook failed" }, 400);
  }
});
