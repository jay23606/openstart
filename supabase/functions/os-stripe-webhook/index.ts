import Stripe from "npm:stripe@18.5.0";
import { adminClient, json } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const resendKey = Deno.env.get("RESEND_API_KEY");
const confirmationFrom = Deno.env.get("RESEND_FROM_EMAIL");
const stripe = stripeKey
  ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() })
  : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

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
        <p style="margin-top:32px">See you at the start,<br><strong>OpenStart</strong></p>
      </div>`,
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

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!stripe || !webhookSecret) return json(request, { error: "Stripe webhook is not configured" }, 503);

  try {
    const signature = request.headers.get("Stripe-Signature");
    if (!signature) return json(request, { error: "Missing Stripe signature" }, 400);
    const payload = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      payload, signature, webhookSecret, undefined, cryptoProvider,
    );
    const admin = adminClient();

    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.openstart_registration_id;
      const orderId = session.metadata?.openstart_order_id;
      if (orderId && session.payment_status === "paid") {
        await admin.from("os_orders").update({
          status: "paid", stripe_payment_intent_id: String(session.payment_intent || ""), paid_at: new Date().toISOString(),
        }).eq("id", orderId).neq("status", "paid");
        const { data: orderRegistrations } = await admin.from("os_registrations").update({
          status: "confirmed", payment_status: "paid",
          stripe_payment_intent_id: String(session.payment_intent || ""), reservation_expires_at: null,
        }).eq("order_id", orderId).neq("payment_status", "paid").select("id");
        for (const registration of orderRegistrations || []) await sendConfirmationEmail(admin, registration.id);
      }
      if (registrationId && session.payment_status === "paid") {
        await admin.from("os_registrations").update({
          status: "confirmed",
          payment_status: "paid",
          stripe_payment_intent_id: String(session.payment_intent || ""),
          reservation_expires_at: null,
        }).eq("id", registrationId).neq("payment_status", "paid");
        await sendConfirmationEmail(admin, registrationId);
      }
    }

    if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
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
      const account = event.data.object as Stripe.Account;
      await admin.from("os_profiles").update({
        stripe_details_submitted: account.details_submitted,
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
      }).eq("stripe_account_id", account.id);
    }

    return json(request, { received: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Webhook failed" }, 400);
  }
});
