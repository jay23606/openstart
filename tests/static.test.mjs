import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the static shell connects the app, stylesheet, manifest, and service worker", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.match(html, /<script type="module" src="app\.js\?v=15"><\/script>/);
  assert.match(html, /href="styles\.css\?v=15"/);
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  assert.match(app, /serviceWorker\.register\("\.\/service-worker\.js"\)/);
});

test("all persisted features use the repository and server-side payment boundaries", async () => {
  const [app, data, checkout, connect, webhook, runnerMigration] = await Promise.all([
    read("app.js"),
    read("data.js"),
    read("supabase/functions/os-create-checkout/index.ts"),
    read("supabase/functions/os-stripe-connect/index.ts"),
    read("supabase/functions/os-stripe-webhook/index.ts"),
    read("supabase/migrations/20260728190000_runner_accounts_and_email.sql"),
  ]);
  assert.match(app, /createEvent\(/);
  assert.match(app, /beginRegistration\(/);
  assert.match(data, /\.from\("os_events"\)/);
  assert.match(data, /\.from\("os_registrations"\)/);
  assert.match(checkout, /os_reserve_registration/);
  assert.match(checkout, /application_fee_amount/);
  assert.match(checkout, /idempotencyKey/);
  assert.match(connect, /core\/accounts/);
  assert.match(connect, /core\/account_links/);
  assert.match(connect, /configurations: \["merchant", "recipient"\]/);
  assert.match(connect, /stripe_transfers: \{ requested: true \}/);
  assert.doesNotMatch(connect, /type: "express"/);
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /payment_status: "paid"/);
  assert.match(webhook, /api\.resend\.com\/emails/);
  assert.match(runnerMigration, /os_claim_my_registrations/);
  assert.match(app, /renderRunnerDashboard/);
  assert.match(app, /exportRoster/);
  assert.match(app, /registrationSettingsForm/);
  assert.match(app, /pricingSettingsForm/);
  assert.match(app, /exportFinancials/);
  assert.match(app, /runnerRegistrationForm/);
  assert.match(app, /acceptTransferForm/);
  assert.match(app, /participantFields/);
  assert.match(app, /raceDayForm/);
  assert.match(app, /startQrScanner/);
  assert.match(app, /productSettingsForm/);
});

test("no framework runtime is referenced by the application", async () => {
  const files = await Promise.all(["index.html", "app.js", "core.js", "data.js"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /(?:from\s+["'](?:next|react|vinext|vite)|@vite|__next)/i);
  assert.doesNotMatch(source, /\.tsx\b/i);
});
