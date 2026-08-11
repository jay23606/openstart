import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const STATE_PATH = resolve("tests/.auth/e2e-state.json");
export const FIXTURES = Object.freeze({
  organizerEmail: "organizer.e2e@example.test",
  runnerEmail: "runner.e2e@example.test",
  publishedEventId: "11111111-1111-4111-8111-111111111101",
  publishedTierId: "11111111-1111-4111-8111-111111111102",
  registrationId: "11111111-1111-4111-8111-111111111103",
  draftEventId: "11111111-1111-4111-8111-111111111104",
  draftTierId: "11111111-1111-4111-8111-111111111105",
  publishedEventName: "OpenStart E2E Spring 10K",
  draftEventName: "OpenStart E2E Draft Race",
});

function projectRef(url) {
  const host = new URL(url).hostname;
  return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : host;
}

export async function testEnvironment(env = process.env) {
  const required = ["E2E_SUPABASE_URL", "E2E_SUPABASE_ANON_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY", "E2E_CONFIRM_PROJECT_REF", "E2E_TEST_PASSWORD"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Authenticated E2E tests require: ${missing.join(", ")}`);
  if (env.E2E_ALLOW_RESET !== "true") throw new Error("Set E2E_ALLOW_RESET=true to acknowledge deterministic test-data cleanup.");
  const ref = projectRef(env.E2E_SUPABASE_URL);
  if (ref !== env.E2E_CONFIRM_PROJECT_REF) throw new Error(`E2E_CONFIRM_PROJECT_REF does not match ${ref}.`);
  const config = await readFile(resolve("config.js"), "utf8");
  const liveUrl = config.match(/SUPABASE_URL\s*=\s*["']([^"']+)/)?.[1];
  if (liveUrl && new URL(liveUrl).origin === new URL(env.E2E_SUPABASE_URL).origin) {
    throw new Error("Refusing authenticated E2E tests: E2E_SUPABASE_URL matches config.js. Use a separate Supabase project.");
  }
  return {
    url: env.E2E_SUPABASE_URL.replace(/\/$/, ""),
    anonKey: env.E2E_SUPABASE_ANON_KEY,
    serviceKey: env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    password: env.E2E_TEST_PASSWORD,
    projectRef: ref,
  };
}

async function request(environment, path, options = {}) {
  const response = await fetch(`${environment.url}${path}`, {
    ...options,
    headers: {
      apikey: environment.serviceKey,
      Authorization: `Bearer ${environment.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function deleteFixtureRows(environment) {
  await request(environment, `/rest/v1/os_events?id=in.(${FIXTURES.publishedEventId},${FIXTURES.draftEventId})`, { method: "DELETE" });
}

async function users(environment) {
  const result = await request(environment, "/auth/v1/admin/users?page=1&per_page=1000");
  return result.users || [];
}

async function deleteFixtureUsers(environment) {
  const fixtureEmails = new Set([FIXTURES.organizerEmail, FIXTURES.runnerEmail]);
  for (const user of await users(environment)) {
    if (fixtureEmails.has(user.email)) await request(environment, `/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  }
}

export async function cleanup(environment) {
  await deleteFixtureRows(environment);
  await deleteFixtureUsers(environment);
}

async function createUser(environment, email, displayName) {
  return request(environment, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: environment.password, email_confirm: true, user_metadata: { display_name: displayName } }),
  });
}

export async function seed(environment) {
  await cleanup(environment);
  try {
    const organizer = await createUser(environment, FIXTURES.organizerEmail, "E2E Organizer");
    const runner = await createUser(environment, FIXTURES.runnerEmail, "E2E Runner");
    const startsAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    await request(environment, "/rest/v1/os_events", {
    method: "POST",
    body: JSON.stringify([
      { id: FIXTURES.publishedEventId, organizer_id: organizer.id, slug: "openstart-e2e-spring-10k", name: FIXTURES.publishedEventName, description: "A deterministic published race used only by the authenticated test suite.", starts_at: startsAt, location_name: "Test City, VA", status: "published" },
      { id: FIXTURES.draftEventId, organizer_id: organizer.id, slug: "openstart-e2e-draft-race", name: FIXTURES.draftEventName, description: "A deterministic private draft used to test concurrent organizer edits.", starts_at: startsAt, location_name: "Test City, VA", status: "draft" },
    ]),
    });
    await request(environment, "/rest/v1/os_event_tiers", {
    method: "POST",
    body: JSON.stringify([
      { id: FIXTURES.publishedTierId, event_id: FIXTURES.publishedEventId, name: "10K", distance_label: "10 kilometers", price_cents: 0, capacity: 250 },
      { id: FIXTURES.draftTierId, event_id: FIXTURES.draftEventId, name: "5K", distance_label: "5 kilometers", price_cents: 0, capacity: 100 },
    ]),
    });
    await request(environment, "/rest/v1/os_registrations", {
    method: "POST",
    body: JSON.stringify({ id: FIXTURES.registrationId, event_id: FIXTURES.publishedEventId, tier_id: FIXTURES.publishedTierId, participant_user_id: runner.id, first_name: "E2E", last_name: "Runner", email: FIXTURES.runnerEmail, emergency_contact: "Test Contact 555-0100", status: "confirmed", payment_status: "not_required", amount_cents: 0 }),
    });
    const state = { organizerId: organizer.id, runnerId: runner.id, ...FIXTURES };
    await mkdir(dirname(STATE_PATH), { recursive: true });
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
    return state;
  } catch (error) {
    await cleanup(environment).catch(() => {});
    throw error;
  }
}
