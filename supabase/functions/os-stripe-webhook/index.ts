import Stripe from "npm:stripe@18.5.0";
import { adminClient, json } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const stripe = stripeKey
  ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() })
  : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

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
      if (registrationId && session.payment_status === "paid") {
        await admin.from("os_registrations").update({
          status: "confirmed",
          payment_status: "paid",
          stripe_payment_intent_id: String(session.payment_intent || ""),
          reservation_expires_at: null,
        }).eq("id", registrationId).neq("payment_status", "paid");
      }
    }

    if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.openstart_registration_id;
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

