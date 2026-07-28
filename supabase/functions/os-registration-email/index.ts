import { adminClient, corsHeaders, json, requiredUser } from "../_shared/common.ts";

const resendKey = Deno.env.get("RESEND_API_KEY");
const confirmationFrom = Deno.env.get("RESEND_FROM_EMAIL");
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!resendKey || !confirmationFrom) return json(request, { error: "Email is not configured" }, 503);

  try {
    const user = await requiredUser(request);
    if (!user) return json(request, { error: "Sign in is required" }, 401);
    const { registrationId } = await request.json();
    const admin = adminClient();
    const { data: registration, error } = await admin.from("os_registrations")
      .select("id, email, first_name, amount_cents, status, os_events!inner(name, starts_at, location_name, organizer_id), os_event_tiers(name, distance_label)")
      .eq("id", registrationId).single();
    if (error) throw error;
    const race = registration.os_events as unknown as Record<string, unknown>;
    const tier = registration.os_event_tiers as unknown as Record<string, unknown>;
    if (race.organizer_id !== user.id) return json(request, { error: "You cannot manage this registration" }, 403);
    if (registration.status !== "confirmed") return json(request, { error: "Only confirmed registrations can be emailed" }, 400);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `openstart-registration-manual-${registration.id}-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        from: confirmationFrom,
        to: [registration.email],
        subject: `Registration confirmed: ${race.name || "your race"}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17211d">
          <h1 style="color:#0f6b4f">You're on the starting line.</h1>
          <p>Hi ${escapeHtml(registration.first_name)}, your registration is confirmed.</p>
          <h2>${escapeHtml(race.name)}</h2>
          <p>${escapeHtml(tier?.name)} · ${escapeHtml(tier?.distance_label)}</p>
          <p>${escapeHtml(race.location_name)} · ${escapeHtml(new Date(String(race.starts_at)).toLocaleDateString("en-US", { dateStyle: "long" }))}</p>
          <p><strong>Registration ID:</strong> ${escapeHtml(registration.id)}</p>
          <p style="margin-top:32px">See you at the start,<br><strong>OpenStart</strong></p>
        </div>`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.message || "Confirmation email failed");
    await admin.from("os_registrations")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", registration.id);
    return json(request, { sent: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Email failed" }, 400);
  }
});
