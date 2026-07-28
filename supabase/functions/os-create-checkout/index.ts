import Stripe from "npm:stripe@18.5.0";
import { adminClient, assertAllowedUrl, corsHeaders, enforceRateLimit, json, optionalUserId } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeKey
  ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() })
  : null;

const cleanUrl = assertAllowedUrl;
const sha256 = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
).map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if(!await enforceRateLimit(request,"checkout",20,300)) return json(request,{error:"Too many checkout attempts. Try again shortly."},429);

  const admin = adminClient();
  let registrationId: string | null = null;
  let orderId: string | null = null;
  let body: Record<string, unknown> = {};

  try {
    body = await request.json();
    const idempotencyKey = String(body.idempotencyKey || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return json(request, { error: "A valid idempotency key is required" }, 400);
    }

    const userId = await optionalUserId(request);
    const participants = Array.isArray(body.participants) ? body.participants : null;
    if (participants?.length) {
      const { data: orderRows, error: orderError } = await admin.rpc("os_reserve_order", {
        p_event_id: body.eventId,
        p_purchaser_user_id: userId,
        p_purchaser_email: body.email,
        p_idempotency_key: idempotencyKey,
        p_participants: participants,
        p_promo_code: body.promoCode || null,
      });
      if (orderError) throw orderError;
      let order = orderRows?.[0];
      if (!order) throw new Error("Order could not be reserved");
      orderId = order.order_id;

      for (let index = 0; index < order.registration_ids.length; index += 1) {
        const person = participants[index] as Record<string, unknown>;
        const { error: answersError } = await admin.rpc("os_save_registration_answers", {
          p_registration_id: order.registration_ids[index],
          p_answers: Array.isArray(person.answers) ? person.answers : [],
          p_waiver_accepted: person.waiverAccepted === true,
          p_waiver_version: person.waiverVersion || null,
        });
        if (answersError) throw answersError;
        if (person.waveId) {
          const { error: waveError } = await admin.rpc("os_assign_registration_wave", {
            p_registration_id: order.registration_ids[index],
            p_wave_id: person.waveId,
            p_estimated_pace_seconds: person.estimatedPaceSeconds || null,
          });
          if (waveError) throw waveError;
        }
      }

      let teamId: string | null = null;
      const team = body.team as Record<string, unknown> | undefined;
      if (team?.mode === "create") {
        if (!userId) throw new Error("Sign in to create a team");
        const joinCode = String(team.joinCode || "").trim();
        const { data: createdTeam, error: teamError } = await admin.from("os_teams").insert({
          event_id: body.eventId, name: String(team.name || "").trim(),
          category: team.category || "club", captain_user_id: userId,
          join_code_hash: joinCode ? await sha256(joinCode.toUpperCase()) : null,
          max_members: team.maxMembers || null,
        }).select("id").single();
        if (teamError) throw teamError;
        teamId = createdTeam.id;
      } else if (team?.mode === "join") {
        const { data: foundTeam, error: teamError } = await admin.from("os_teams")
          .select("id,join_code_hash,max_members").eq("id", team.teamId).eq("event_id", body.eventId).single();
        if (teamError) throw teamError;
        if (foundTeam.join_code_hash && foundTeam.join_code_hash !== await sha256(String(team.joinCode || "").trim().toUpperCase())) {
          throw new Error("Team access code is incorrect");
        }
        if (foundTeam.max_members) {
          const { count } = await admin.from("os_registrations").select("id", { count: "exact", head: true })
            .eq("team_id", foundTeam.id).in("status", ["reserved", "pending", "confirmed"]);
          if ((count || 0) + participants.length > foundTeam.max_members) throw new Error("This team is full");
        }
        teamId = foundTeam.id;
      }
      if (teamId) {
        for (let index = 0; index < order.registration_ids.length; index += 1) {
          await admin.from("os_registrations").update({
            team_id: teamId, team_role: index === 0 && team?.mode === "create" ? "captain" : "member",
            relay_leg: (participants[index] as Record<string, unknown>).relayLeg || null,
          }).eq("id", order.registration_ids[index]);
        }
      }

      const { data: extrasRows, error: extrasError } = await admin.rpc("os_add_order_extras", {
        p_order_id: order.order_id,
        p_items: Array.isArray(body.items) ? body.items : [],
        p_donation_cents: Math.max(0, Math.round(Number(body.donationCents) || 0)),
        p_dedication: body.dedication || null,
        p_anonymous: body.anonymousDonation === true,
      });
      if (extrasError) throw extrasError;
      if (extrasRows?.[0]) order = { ...order, total_cents: extrasRows[0].total_cents };

      if (order.total_cents === 0) {
        await admin.from("os_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.order_id);
        return json(request, { status: "confirmed", orderId: order.order_id, registrationIds: order.registration_ids });
      }
      if (!stripe) throw new Error("Stripe sandbox has not been configured");
      if (!order.stripe_account_id) throw new Error("This organizer has not connected Stripe");
      const { data: reservedRegistrations, error: registrationsError } = await admin.from("os_registrations")
        .select("id,amount_cents,first_name,last_name,os_event_tiers(name)").in("id", order.registration_ids);
      if (registrationsError) throw registrationsError;
      const { data: extras, error: extrasFetchError } = await admin.from("os_order_items")
        .select("name,unit_amount_cents,quantity").eq("order_id", order.order_id);
      if (extrasFetchError) throw extrasFetchError;
      const successUrl = new URL(cleanUrl(body.successUrl));
      successUrl.searchParams.set("payment", "success");
      successUrl.searchParams.set("order", order.order_id);
      const cancelUrl = new URL(cleanUrl(body.cancelUrl));
      cancelUrl.searchParams.set("payment", "cancelled");
      cancelUrl.searchParams.set("order", order.order_id);
      const fee = Math.round(order.total_cents * order.platform_fee_bps / 10000);
      const session = await stripe.checkout.sessions.create({
        mode: "payment", customer_email: String(body.email), client_reference_id: order.order_id,
        success_url: successUrl.toString(), cancel_url: cancelUrl.toString(),
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        line_items: [...reservedRegistrations.map((item) => ({
          quantity: 1,
          price_data: { currency: "usd", unit_amount: item.amount_cents,
            product_data: { name: `${order.event_name} — ${(item.os_event_tiers as unknown as Record<string,unknown>)?.name || "Entry"} — ${item.first_name} ${item.last_name}` } },
        })), ...(extras || []).map((item) => ({
          quantity: item.quantity,
          price_data: { currency: "usd", unit_amount: item.unit_amount_cents, product_data: { name: item.name } },
        }))],
        payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: order.stripe_account_id },
          metadata: { openstart_order_id: order.order_id } },
        metadata: { openstart_order_id: order.order_id },
      }, { idempotencyKey });
      await admin.from("os_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.order_id);
      await admin.from("os_registrations").update({ stripe_checkout_session_id: session.id }).in("id", order.registration_ids);
      return json(request, { status: "checkout", orderId: order.order_id, registrationIds: order.registration_ids, checkoutUrl: session.url });
    }

    const { data, error } = await admin.rpc("os_reserve_registration", {
      p_event_id: body.eventId,
      p_tier_id: body.tierId,
      p_first_name: body.firstName,
      p_last_name: body.lastName,
      p_email: body.email,
      p_emergency_contact: body.emergencyContact,
      p_participant_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_promo_code: body.promoCode || null,
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
    if (orderId) {
      await admin.from("os_orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "reserved");
      await admin.from("os_registrations").update({ status: "cancelled" }).eq("order_id", orderId).eq("status", "reserved");
    }
    const message = error instanceof Error ? error.message : "Checkout failed";
    if (message.includes("SOLD_OUT")) {
      if (body?.joinWaitlist === true) {
        const waitPerson = Array.isArray(body.participants) ? body.participants[0] as Record<string, unknown> : body;
        const { data: waitlistId, error: waitlistError } = await admin.rpc("os_join_waitlist", {
          p_event_id: body.eventId,
          p_tier_id: waitPerson.tierId,
          p_first_name: waitPerson.firstName,
          p_last_name: waitPerson.lastName,
          p_email: waitPerson.email,
        });
        if (!waitlistError) return json(request, { status: "waitlisted", waitlistId });
        return json(request, { error: waitlistError.message }, 400);
      }
      return json(request, { error: "This registration option is sold out", soldOut: true }, 409);
    }
    return json(request, { error: message }, 400);
  }
});
