import QRCode from "npm:qrcode@1.5.4";
import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

const signingSecret = Deno.env.get("RACE_DAY_SIGNING_SECRET");
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const decode = (value: string) => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};
const sign = async (payload: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingSecret!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
};
const createToken = async (registrationId: string, expiresAt: number) => {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ registrationId, expiresAt })));
  return `${payload}.${await sign(payload)}`;
};
const verifyToken = async (token: string) => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || await sign(payload) !== signature) throw new Error("Pass is invalid");
  const parsed = JSON.parse(new TextDecoder().decode(decode(payload)));
  if (parsed.expiresAt < Date.now()) throw new Error("Pass has expired");
  return parsed as { registrationId: string; expiresAt: number };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if(!await enforceRateLimit(request,"race-day",240,300)) return json(request,{error:"Too many race-day requests. Try again shortly."},429);
  if (!signingSecret) return json(request, { error: "Race-day signing is not configured" }, 503);
  try {
    const user = await requiredUser(request);
    if (!user) return json(request, { error: "Sign in is required" }, 401);
    const body = await request.json();
    const action = String(body.action || "");
    const admin = adminClient();

    const authorizeEvent = async (eventId: string, roles: string[] = []) => {
      const { data: event } = await admin.from("os_events").select("organizer_id,name").eq("id", eventId).single();
      if (event.organizer_id === user.id) return { event, role: "organizer" };
      const { data: staff } = await admin.from("os_event_staff").select("role")
        .eq("event_id", eventId).ilike("email", user.email || "").maybeSingle();
      if (!staff || (roles.length && !roles.includes(staff.role))) throw new Error("You do not have race-day access");
      return { event, role: staff.role };
    };

    if (action === "get_pass") {
      const { data: registration, error } = await admin.from("os_registrations")
        .select("id,participant_user_id,status,first_name,last_name,bib_number,os_events!inner(organizer_id,starts_at)")
        .eq("id", body.registrationId).single();
      if (error) throw error;
      const race = registration.os_events as unknown as Record<string, unknown>;
      if (registration.participant_user_id !== user.id && race.organizer_id !== user.id) throw new Error("You cannot access this pass");
      if (registration.status !== "confirmed") throw new Error("Only confirmed registrations have passes");
      const expiresAt = new Date(String(race.starts_at)).getTime() + 7 * 86400000;
      const token = await createToken(registration.id, expiresAt);
      const qrSvg = await QRCode.toString(token, { type: "svg", width: 280, margin: 1, errorCorrectionLevel: "M" });
      return json(request, { token, qrSvg, expiresAt });
    }

    if (action === "scan") {
      const parsed = await verifyToken(String(body.token || ""));
      const { data: registration, error } = await admin.from("os_registrations")
        .select("*, os_events!inner(name), os_event_tiers(name,distance_label), os_waves(name,starts_at)").eq("id", parsed.registrationId).single();
      if (error) throw error;
      await authorizeEvent(registration.event_id, ["admin","packet_pickup","scanner"]);
      return json(request, { registration });
    }

    if (action === "lookup") {
      await authorizeEvent(body.eventId, ["admin","registration","packet_pickup","scanner"]);
      const term = String(body.term || "").trim().replace(/[,%()]/g, "");
      if (term.length < 2) throw new Error("Enter at least two characters");
      const { data, error } = await admin.from("os_registrations")
        .select("id,first_name,last_name,email,bib_number,status,payment_status,packet_picked_up_at,checked_in_at,tier_id,wave_id,os_event_tiers(name),os_waves(name,starts_at),os_orders(os_order_items(id,item_type,name,quantity,fulfilled_at))")
        .eq("event_id", body.eventId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,bib_number.ilike.%${term}%`)
        .limit(25);
      if (error) throw error;
      return json(request, { registrations: data });
    }

    if (["pickup","checkin"].includes(action)) {
      const { data: registration, error } = await admin.from("os_registrations").select("id,event_id,status").eq("id", body.registrationId).single();
      if (error) throw error;
      await authorizeEvent(registration.event_id, action === "pickup" ? ["admin","packet_pickup"] : ["admin","scanner"]);
      if (registration.status !== "confirmed") throw new Error("Registration is not confirmed");
      const changes = action === "pickup"
        ? { packet_picked_up_at: new Date().toISOString(), packet_picked_up_by: user.id }
        : { checked_in_at: new Date().toISOString(), checked_in_by: user.id };
      await admin.from("os_registrations").update(changes).eq("id", registration.id);
      await admin.rpc("os_log_registration_activity", {
        p_registration_id: registration.id, p_actor_user_id: user.id,
        p_action: action === "pickup" ? "packet_picked_up" : "checked_in", p_details: {},
      });
      return json(request, { ok: true, ...changes });
    }

    if (action === "fulfill_item") {
      const { data: item, error } = await admin.from("os_order_items")
        .select("id,fulfilled_at,os_orders!inner(event_id)").eq("id", body.itemId).single();
      if (error) throw error;
      const customerOrder = item.os_orders as unknown as Record<string, unknown>;
      await authorizeEvent(String(customerOrder.event_id), ["admin","packet_pickup"]);
      if (item.fulfilled_at) throw new Error("This item was already fulfilled");
      const fulfilledAt = new Date().toISOString();
      await admin.from("os_order_items").update({ fulfilled_at: fulfilledAt, fulfilled_by: user.id }).eq("id", item.id).is("fulfilled_at", null);
      return json(request, { ok: true, fulfilledAt });
    }

    if (action === "bulk_assign_bibs") {
      await authorizeEvent(body.eventId, ["admin","registration"]);
      let query = admin.from("os_registrations").select("id").eq("event_id", body.eventId)
        .eq("status", "confirmed").is("bib_number", null).order("created_at");
      if (body.tierId) query = query.eq("tier_id", body.tierId);
      const { data: registrations, error } = await query;
      if (error) throw error;
      let bib = Math.max(1, Number(body.startNumber) || 1);
      for (const registration of registrations || []) {
        await admin.from("os_registrations").update({ bib_number: String(bib++) }).eq("id", registration.id);
      }
      return json(request, { assigned: registrations?.length || 0 });
    }

    if (action === "add_staff") {
      const { data: event } = await admin.from("os_events").select("organizer_id").eq("id", body.eventId).single();
      if (event.organizer_id !== user.id) throw new Error("Only the organizer can add staff");
      const { error } = await admin.from("os_event_staff").insert({
        event_id: body.eventId, email: String(body.email).trim().toLowerCase(), role: body.role,
      });
      if (error) throw error;
      return json(request, { ok: true });
    }

    if (action === "walkup") {
      await authorizeEvent(body.eventId, ["admin","registration"]);
      const { data: tier } = await admin.from("os_event_tiers").select("id,event_id").eq("id", body.tierId).eq("event_id", body.eventId).single();
      if (!tier) throw new Error("Registration option was not found");
      const { data, error } = await admin.from("os_registrations").insert({
        event_id: body.eventId, tier_id: body.tierId, first_name: body.firstName, last_name: body.lastName,
        email: String(body.email).trim().toLowerCase(), emergency_contact: body.emergencyContact,
        bib_number: body.bibNumber || null, status: "confirmed", payment_status: "not_required",
        registration_source: "manual", amount_cents: 0, idempotency_key: crypto.randomUUID(),
      }).select("id").single();
      if (error) throw error;
      return json(request, { ok: true, registrationId: data.id });
    }
    return json(request, { error: "Unknown race-day action" }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Race-day action failed" }, 400);
  }
});
