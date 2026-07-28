import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the static shell connects the app, stylesheet, manifest, and service worker", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.match(html, /<script type="module" src="app\.js\?v=25"><\/script>/);
  assert.match(html, /href="styles\.css\?v=25"/);
  assert.match(app, /pendingView:\s*"runner"/);
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(app, /serviceWorker\.register\("\.\/service-worker\.js"\)/);
  assert.match(app, /function renderHelp\(\)/);
  assert.match(html, /data-view="help"/);
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
  assert.match(app, /campaignForm/);
  assert.match(data, /communicationsAction/);
  assert.match(app, /resultsManagerForm/);
  assert.match(app, /renderResults/);
  assert.match(data, /resultsAction/);
  assert.match(app, /volunteerManagerForm/);
  assert.match(app, /volunteerSignupForm/);
  assert.match(data, /joinVolunteerShift/);
  assert.match(app, /siteEditorForm/);
  assert.match(app, /event-content-sections/);
  assert.match(data, /uploadEventAsset/);
  assert.match(app, /waveManagerForm/);
  assert.match(app, /runnerWaveForm/);
  assert.match(data, /wavesAction/);
  assert.match(app, /System health/);
  assert.match(app, /Export my data/);
  assert.match(data, /accountAction/);
  assert.match(app, /seriesSettingsForm/);
  assert.match(app, /renderSeries/);
  assert.match(data, /seriesAction/);
  assert.match(app, /duplicateEventForm/);
  assert.match(app, /checklistForm/);
  assert.match(data, /os_duplicate_event/);
  assert.match(data, /os_event_checklist_items/);
});

test("no framework runtime is referenced by the application", async () => {
  const files = await Promise.all(["index.html", "app.js", "core.js", "data.js"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /(?:from\s+["'](?:next|react|vinext|vite)|@vite|__next)/i);
  assert.doesNotMatch(source, /\.tsx\b/i);
});
