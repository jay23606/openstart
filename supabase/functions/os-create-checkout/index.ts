import Stripe from "npm:stripe@18.5.0";
import { adminClient, corsHeaders, json, optionalUserId } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeKey
  ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() })
  : null;

const cleanUrl = (value: unknown) => {
  const url = new URL(String(value));
  if (!["https://jay23606.github.io", "http://localhost:4173", "http://127.0.0.1:4173"].includes(url.origin)) {
    throw new Error("Return URL is not allowed");
  }
  return url.toString();
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const admin = adminClient();
  let registrationId: string | null = null;

  try {
    const body = await request.json();
    const idempotencyKey = String(body.idempotencyKey || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return json(request, { error: "A valid idempotency key is required" }, 400);
    }

    const userId = await optionalUserId(request);
    const { data, error } = await admin.rpc("os_reserve_registration", {
      p_event_id: body.eventId,
      p_tier_id: body.tierId,
      p_first_name: body.firstName,
      p_last_name: body.lastName,
      p_email: body.email,
      p_emergency_contact: body.emergencyContact,
      p_participant_user_id: userId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;

    const reservation = data?.[0];
    if (!reservation) throw new Error("Registration could not be reserved");
    registrationId = reservation.registration_id;

    const { error: answersError } = await admin.rpc("os_save_registration_answers", {
      p_registration_id: registrationId,
      p_answers: Array.isArray(body.answers) ? body.answers : [],
      p_waiver_accepted: body.waiverAccepted === true,
      p_waiver_version: body.waiverVersion || null,
    });
    if (answersError) throw answersError;

    if (reservation.amount_cents === 0) {
      return json(request, { status: "confirmed", registrationId });
    }
    if (!stripe) throw new Error("Stripe sandbox has not been configured");
    if (!reservation.stripe_account_id) throw new Error("This organizer has not connected Stripe");

    const successUrl = new URL(cleanUrl(body.successUrl));
    successUrl.searchParams.set("payment", "success");
    successUrl.searchParams.set("registration", registrationId);
    const cancelUrl = new URL(cleanUrl(body.cancelUrl));
    cancelUrl.searchParams.set("payment", "cancelled");
    cancelUrl.searchParams.set("registration", registrationId);

    const fee = Math.round(reservation.amount_cents * reservation.platform_fee_bps / 10000);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: String(body.email),
      client_reference_id: registrationId,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: reservation.amount_cents,
          product_data: {
            name: `${reservation.event_name} — ${reservation.tier_name}`,
            metadata: { openstart_event_id: String(body.eventId), openstart_tier_id: String(body.tierId) },
          },
        },
      }],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: reservation.stripe_account_id },
        metadata: { openstart_registration_id: registrationId },
      },
      metadata: { openstart_registration_id: registrationId },
    }, { idempotencyKey });

    const { error: updateError } = await admin
      .from("os_registrations")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", registrationId)
      .eq("status", "reserved");
    if (updateError) throw updateError;

    return json(request, { status: "checkout", registrationId, checkoutUrl: session.url });
  } catch (error) {
    if (registrationId) {
      await admin.from("os_registrations")
        .update({ status: "cancelled" })
        .eq("id", registrationId)
        .eq("status", "reserved");
    }
    return json(request, { error: error instanceof Error ? error.message : "Checkout failed" }, 400);
  }
});
