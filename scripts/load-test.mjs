import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { testEnvironment } from "../tests/e2e-auth/supabase-test-env.mjs";

const environment = await testEnvironment();
const capacity = Math.max(10, Math.min(Number(process.env.LOAD_CAPACITY || 40), 200));
const overflow = Math.max(5, Math.min(Number(process.env.LOAD_OVERFLOW || 10), 50));
const discoveryRequests = Math.max(10, Math.min(Number(process.env.LOAD_DISCOVERY_REQUESTS || 40), 500));
const eventId = "22222222-2222-4222-8222-222222222201";
const tierId = "22222222-2222-4222-8222-222222222202";
const organizerEmail = "load-test-organizer@example.test";

function headers(key = environment.serviceKey) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function call(path, { method = "GET", body, key, prefer } = {}) {
  const started = performance.now();
  const response = await fetch(`${environment.url}${path}`, {
    method, headers: { ...headers(key), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, ms: performance.now() - started };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] || 0;
}

async function cleanup() {
  await call(`/rest/v1/os_events?id=eq.${eventId}`, { method: "DELETE" });
  const users = await call("/auth/v1/admin/users?page=1&per_page=1000");
  const organizer = users.data?.users?.find((user) => user.email === organizerEmail);
  if (organizer) await call(`/auth/v1/admin/users/${organizer.id}`, { method: "DELETE" });
}

async function seed() {
  await cleanup();
  const created = await call("/auth/v1/admin/users", { method: "POST", body: {
    email: organizerEmail, password: environment.password, email_confirm: true,
    user_metadata: { display_name: "Load Test Organizer" },
  }});
  if (!created.ok) throw new Error(`Could not create load organizer: ${JSON.stringify(created.data)}`);
  const startsAt = new Date(Date.now() + 45 * 86400_000).toISOString();
  const event = await call("/rest/v1/os_events", { method: "POST", prefer: "return=minimal", body: {
    id: eventId, organizer_id: created.data.id, slug: "openstart-load-test",
    name: "OpenStart Load Test", description: "Disposable event for controlled concurrency testing only.",
    starts_at: startsAt, location_name: "Test City, VA", status: "published",
  }});
  if (!event.ok) throw new Error(`Could not create load event: ${JSON.stringify(event.data)}`);
  const tier = await call("/rest/v1/os_event_tiers", { method: "POST", prefer: "return=minimal", body: {
    id: tierId, event_id: eventId, name: "Load Wave", distance_label: "10K", price_cents: 0, capacity,
  }});
  if (!tier.ok) throw new Error(`Could not create load tier: ${JSON.stringify(tier.data)}`);
}

async function edgeSmoke() {
  const idempotencyKey = randomUUID();
  const payload = { eventId, tierId, firstName: "Edge", lastName: "Smoke",
    email: "edge-smoke@example.test", emergencyContact: "Test Contact", idempotencyKey,
    answers: [], waiverAccepted: true };
  const first = await call("/functions/v1/os-create-checkout", { method: "POST", key: environment.anonKey, body: payload });
  const retry = await call("/functions/v1/os-create-checkout", { method: "POST", key: environment.anonKey, body: payload });
  if (!first.ok || first.data?.status !== "confirmed") throw new Error(`Edge registration failed: ${JSON.stringify(first.data)}`);
  if (!retry.ok || retry.data?.registrationId !== first.data.registrationId) throw new Error("Idempotent Edge retry returned a different registration");
  return [first.ms, retry.ms];
}

async function discoveryLoad() {
  const jobs = Array.from({ length: discoveryRequests }, () => call("/rest/v1/rpc/os_discover_events", {
    method: "POST", key: environment.anonKey,
    body: { p_query: "OpenStart Load", p_state: "VA", p_city: "Test City", p_limit: 12, p_offset: 0 },
  }));
  const results = await Promise.all(jobs);
  if (results.some((result) => !result.ok)) throw new Error("One or more discovery requests failed");
  return results.map((result) => result.ms);
}

async function registrationSpike() {
  const attempts = capacity + overflow - 1; // edge smoke already occupies one spot
  const jobs = Array.from({ length: attempts }, (_, index) => call("/rest/v1/rpc/os_reserve_registration", {
    method: "POST", body: { p_event_id: eventId, p_tier_id: tierId, p_first_name: "Load",
      p_last_name: `Runner ${index}`, p_email: `load-runner-${index}@example.test`,
      p_emergency_contact: "Test Contact", p_participant_user_id: null,
      p_idempotency_key: randomUUID(), p_promo_code: null },
  }));
  const results = await Promise.all(jobs);
  return { results, successes: results.filter((result) => result.ok), rejected: results.filter((result) => !result.ok) };
}

async function verify(spike) {
  const registrations = await call(`/rest/v1/os_registrations?event_id=eq.${eventId}&select=id,status`);
  const tier = await call(`/rest/v1/os_event_tiers?id=eq.${tierId}&select=capacity,reserved_count`);
  if (!registrations.ok || !tier.ok) throw new Error("Could not verify load-test invariants");
  const active = registrations.data.filter((row) => ["reserved", "pending", "confirmed", "cancel_requested"].includes(row.status)).length;
  if (active !== capacity) throw new Error(`Expected exactly ${capacity} active registrations; found ${active}`);
  if (tier.data[0]?.reserved_count !== active) throw new Error(`Capacity counter drift: counter=${tier.data[0]?.reserved_count}, actual=${active}`);
  if (spike.rejected.length !== overflow) throw new Error(`Expected ${overflow} sold-out rejections; found ${spike.rejected.length}`);
  return active;
}

try {
  await seed();
  const edgeTimes = await edgeSmoke();
  const discoveryTimes = await discoveryLoad();
  const spike = await registrationSpike();
  const active = await verify(spike);
  const registrationTimes = spike.results.map((result) => result.ms);
  const report = {
    target: environment.projectRef, capacity, active, soldOutRejected: spike.rejected.length,
    discovery: { requests: discoveryTimes.length, p50Ms: Math.round(percentile(discoveryTimes, .5)), p95Ms: Math.round(percentile(discoveryTimes, .95)) },
    registration: { attempts: spike.results.length + 1, p50Ms: Math.round(percentile(registrationTimes, .5)), p95Ms: Math.round(percentile(registrationTimes, .95)) },
    edgeIdempotency: { requests: 2, p95Ms: Math.round(percentile(edgeTimes, .95)), oneRegistration: true },
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.discovery.p95Ms > Number(process.env.LOAD_DISCOVERY_P95_MS || 3000)) throw new Error("Discovery p95 exceeded its threshold");
  if (report.registration.p95Ms > Number(process.env.LOAD_REGISTRATION_P95_MS || 5000)) throw new Error("Registration p95 exceeded its threshold");
} finally {
  await cleanup();
}
