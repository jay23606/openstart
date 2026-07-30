import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the static shell connects the app, stylesheet, manifest, theme, and service worker", async () => {
  const [html, app, worker, theme, appState, contentViews, publicController, publicViews] = await Promise.all([read("index.html"), read("app.js"), read("service-worker.js"), read("theme.js"), read("modules/app-state.js"), read("modules/content-views.js"), read("features/public/controller.js"), read("modules/public-views.js")]);
  // Assert the wiring, not a specific cache-bust number: pinning the literal
  // version meant every routine bump failed this test. What actually matters is
  // that both assets are busted together and the service-worker cache name is
  // bumped to match, so a release cannot serve a stale shell.
  const scriptVersion = html.match(/<script type="module" src="app\.js\?v=(\d+)"><\/script>/);
  const styleVersion = html.match(/href="styles\.css\?v=(\d+)"/);
  const cacheVersion = worker.match(/const CACHE = "openstart-v(\d+)"/);
  assert.ok(scriptVersion, "index.html must load app.js with a ?v= cache-bust");
  assert.ok(styleVersion, "index.html must load styles.css with a ?v= cache-bust");
  assert.ok(cacheVersion, "service-worker.js must define a versioned CACHE name");
  assert.equal(styleVersion[1], scriptVersion[1], "app.js and styles.css must share a cache-bust version");
  assert.equal(cacheVersion[1], scriptVersion[1], "service-worker CACHE must match the shell asset version");
  assert.match(appState, /pendingView:\s*"runner"/);
  assert.match(appState, /createAppStore/);
  assert.match(app, /mountNavigationComponent/);
  assert.match(app, /mountDiscoveryResultsComponent/);
  assert.doesNotMatch(app, /appStore\.select\(/);
  assert.match(app, /actionState: appStore\.action/);
  assert.match(app, /appStore\.patch\(\{\s*events,\s*discoverTotal:/);
  assert.match(app, /loadedRegistrationEvents: new Set\(\[\.\.\.state\.loadedRegistrationEvents, eventId\]\)/);
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(app, /serviceWorker\.register\("\.\/service-worker\.js"\)/);
  assert.match(app, /function renderHelp\(\)/);
  assert.match(app, /function renderArchitecture\(\)/);
  assert.match(app, /pageLifecycle\.render\(architectureView\(\)/);
  assert.match(contentViews, /export function architectureView\(\)/);
  assert.match(contentViews, /class="architecture-page"/);
  assert.match(contentViews, /data-view="architecture"/);
  assert.match(contentViews, /Postgres \+ RLS/);
  assert.match(contentViews, /PAYMENT FLOW/);
  assert.match(contentViews, /tiny observable store/);
  assert.match(html, /data-view="help"/);
  assert.match(html, /data-view="architecture"/);
  assert.match(html, /data-view="demo"/);
  assert.match(app, /function renderDemo\(\)/);
  assert.match(app, /from "\.\/modules\/app-state\.js/);
  assert.match(app, /from "\.\/modules\/content-views\.js/);
  assert.match(app, /from "\.\/modules\/public-views\.js/);
  assert.match(app, /from "\.\/modules\/page-lifecycle\.js/);
  assert.match(app, /from "\.\/modules\/shell-controller\.js/);
  assert.match(app, /pageLifecycle\.afterNavigate/);
  assert.doesNotMatch(app, /page\.innerHTML\s*=/);
  assert.match(app, /createPublicController/);
  assert.match(app, /createContentController/);
  assert.match(app, /createDemoController/);
  assert.match(app, /createAccountController/);
  assert.match(app, /publicController,\s+contentController,\s+demoController,\s+accountController,\s+platformController/);
  assert.match(publicController, /publicViews\.discoveryPage\(discoveryModel\(\)\)/);
  assert.match(publicController, /publicViews\.eventPage\(model\)/);
  assert.match(publicController, /async function handleClick\(target\)/);
  assert.match(publicController, /function handleInput\(target\)/);
  assert.match(publicController, /patchState\(\{ discoverQuery: value, discoverVisible: discoverPageSize \}, "discovery\.query-changed"\)/);
  assert.match(publicController, /"discovery\.query-changed"/);
  assert.match(app, /"organizer\.loaded"/);
  assert.doesNotMatch(app, /state\.(setupEventId|view|selectedEvent|pendingTransfer)\s*=/);
  assert.doesNotMatch(app, /target\.matches\("\[data-show-more\]"\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-help-filter\]"\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-help-search\]"\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-create-showcase\]"\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-export-account\]"\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-connect-stripe\]"\)/);
  assert.doesNotMatch(app, /target\.dataset\.viewAthlete/);
  assert.doesNotMatch(app, /form\.id\s*===\s*"auth-form"/);
  assert.doesNotMatch(app, /form\.id\s*===\s*"athlete-profile-form"/);
  assert.doesNotMatch(app, /function filterRoster/);
  assert.doesNotMatch(app, /event\.target\.dataset\.waitlistId/);
  assert.doesNotMatch(app, /event\.target\.name !== "template_id"/);
  assert.doesNotMatch(app, /let draggedSectionId/);
  assert.doesNotMatch(app, /ids\.map\(\(id,sort_order\)/);
  assert.doesNotMatch(app, /state\.pendingView="runner"/);
  assert.doesNotMatch(app, /await supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-view\]"\)/);
  assert.doesNotMatch(app, /target\.matches\("\[data-reset-demo\]"\)/);
  assert.match(publicViews, /function discoveryResults\(model\)/);
  assert.match(publicViews, /function discoveryPage\(model\)/);
  assert.match(publicViews, /function eventPage\(model\)/);
  assert.doesNotMatch(app, /function publicEventCard/);
  assert.doesNotMatch(app, /class="event-detail"/);
  assert.match(app, /from "\.\/modules\/discovery\.js/);
  assert.match(app, /from "\.\/modules\/ui\.js/);
  assert.doesNotMatch(app, /const STATE_BOXES/);
  assert.doesNotMatch(app, /const helpArticles=/);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /src="theme\.js\?v=/);
  assert.match(worker, /theme\.js/);
  assert.match(worker, /modules\/public-view-models\.js/);
  assert.match(worker, /modules\/public-views\.js/);
  assert.match(worker, /modules\/page-lifecycle\.js/);
  assert.match(worker, /modules\/shell-controller\.js/);
  assert.match(worker, /modules\/store\.js/);
  assert.match(worker, /modules\/view-runtime\.js/);
  assert.match(worker, /modules\/navigation-component\.js/);
  assert.match(worker, /modules\/discovery-results-component\.js/);
  assert.match(worker, /modules\/organizer-dashboard-component\.js/);
  assert.match(worker, /modules\/runner-dashboard-component\.js/);
  assert.match(worker, /modules\/form-state\.js/);
  assert.doesNotMatch(publicController, /results\.innerHTML/);
  assert.match(theme, /prefers-color-scheme: dark/);
  assert.match(theme, /openstart-theme/);
  assert.match(theme, /aria-label/);
  assert.match(publicViews, /assets\/openstart-race-hero\.png/);
  assert.match(worker, /assets\/openstart-race-hero\.png/);
  assert.match(publicViews, /class="race-type race-type-/);
});

test("all persisted features use the repository and server-side payment boundaries", async () => {
  const [app, accountViews, publicViews, registrationController, registrationViews, organizerController, organizerViews, lotteryViews, platformViews, seriesViews, data, checkout, connect, webhook, registrationAction, runnerMigration, integrityMigration] = await Promise.all([
    read("app.js"),
    read("modules/account-views.js"),
    read("modules/public-views.js"),
    read("features/registration/controller.js"),
    read("features/registration/views.js"),
    read("features/organizer/controller.js"),
    read("features/organizer/views.js"),
    read("features/lottery/views.js"),
    read("features/platform/views.js"),
    read("features/series/views.js"),
    read("data.js"),
    read("supabase/functions/os-create-checkout/index.ts"),
    read("supabase/functions/os-stripe-connect/index.ts"),
    read("supabase/functions/os-stripe-webhook/index.ts"),
    read("supabase/functions/os-registration-action/index.ts"),
    read("supabase/migrations/20260728190000_runner_accounts_and_email.sql"),
    read("supabase/migrations/20260729110000_registration_integrity.sql"),
  ]);
  assert.match(`${app}\n${organizerController}`, /createEvent\(/);
  assert.match(`${app}\n${registrationController}`, /beginRegistration\(/);
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
  assert.match(registrationViews, /function participantFields\(event, index\)/);
  assert.match(registrationViews, /function registration\(event\)/);
  assert.match(registrationViews, /function runner\(item\)/);
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
  assert.match(publicViews, /event-content-sections/);
  assert.match(data, /uploadEventAsset/);
  assert.match(app, /waveManagerForm/);
  assert.match(app, /runnerWaveForm/);
  assert.match(data, /wavesAction/);
  assert.match(platformViews, /System health/);
  assert.match(platformViews, /function consolePage\(data\)/);
  assert.match(platformViews, /Reconciliation alerts/);
  assert.match(platformViews, /function health\(healthData\)/);
  assert.match(accountViews, /Export my data/);
  assert.match(app, /accountViews\.runnerDashboard\(state\)/);
  assert.match(accountViews, /function runnerDashboard\(state\)/);
  assert.match(data, /accountAction/);
  assert.match(app, /seriesSettingsForm/);
  assert.match(app, /renderSeries/);
  assert.match(app, /seriesViews\.publicPage\(series, standings\)/);
  assert.match(seriesViews, /function publicPage\(series, standings\)/);
  assert.match(data, /seriesAction/);
  assert.match(app, /duplicateEventForm/);
  assert.match(app, /checklistForm/);
  assert.match(organizerViews, /function duplicate\(source\)/);
  assert.match(organizerViews, /function checklist\(source\)/);
  assert.match(organizerViews, /function roster\(source\)/);
  assert.match(app, /organizerViews\.dashboard\(state, configured, eventById\)/);
  assert.match(organizerViews, /function dashboard\(state, configured, eventById\)/);
  assert.match(data, /os_duplicate_event/);
  assert.match(data, /os_event_checklist_items/);
  assert.match(app, /lotteryApplicationForm/);
  assert.match(lotteryViews, /function lifecycle\(event\)/);
  assert.match(lotteryViews, /data-run-lottery/);
  assert.match(data, /os_submit_lottery_application/);
  assert.match(data, /os_lottery_applications/);
  assert.match(integrityMigration, /os_registration_email_event_active_unique/);
  assert.match(integrityMigration, /registration_mode<>'open'/);
  assert.match(integrityMigration, /os_enforce_tier_capacity/);
  assert.match(integrityMigration, /os_enforce_team_capacity/);
  assert.match(integrityMigration, /status='expired',payment_status='failed'/);
  assert.match(integrityMigration, /drop policy if exists "participants create registrations"/);
  assert.match(integrityMigration, /revoke update on table public\.os_profiles/);
  assert.match(integrityMigration, /os_protect_event_financial_settings/);
  assert.match(registrationAction, /registration\.status !== "confirmed"/);
});

test("the private showcase is isolated, disposable, and server-created", async () => {
  const [organizerViews, data, migration, contentViews] = await Promise.all([
    read("features/organizer/views.js"),
    read("data.js"),
    read("supabase/migrations/20260729120000_showcase_demo.sql"),
    read("modules/content-views.js"),
  ]);
  assert.match(organizerViews, /const realEvents = state\.events\.filter\(\(event\) => !event\.is_showcase\)/);
  assert.match(contentViews, /No real payments/);
  assert.match(contentViews, /No participant emails/);
  assert.match(data, /os_create_showcase_event/);
  assert.match(data, /os_delete_showcase_event/);
  assert.match(migration, /is_showcase boolean not null default false/);
  assert.match(migration, /where organizer_id=v_user and is_showcase/);
  assert.match(migration, /organizer_id=auth\.uid\(\) and is_showcase/);
  assert.match(migration, /status.*'draft'/s);
});

test("event publishing is guided and server-authoritative", async () => {
  const [app,organizerViews,data,migration] = await Promise.all([
    read("app.js"),
    read("features/organizer/views.js"),
    read("data.js"),
    read("supabase/migrations/20260729130000_event_setup_wizard.sql"),
  ]);
  assert.match(app,/function renderSetupWizard/);
  assert.match(organizerViews,/Create draft & continue/);
  assert.match(organizerViews,/READY TO PUBLISH/);
  assert.match(organizerViews,/setup-basics-form/);
  assert.match(data,/os_event_readiness/);
  assert.match(data,/os_publish_event/);
  assert.match(migration,/os_enforce_event_publish_readiness/);
  assert.match(migration,/Finish Stripe setup before publishing a paid event/);
  assert.match(migration,/Showcase events cannot be published/);
});

test("the lottery lifecycle is immutable, auditable, and payment verified", async () => {
  const [app,data,migration,lottery,webhook,workflow] = await Promise.all([
    read("app.js"),
    read("data.js"),
    read("supabase/migrations/20260729140000_lottery_lifecycle.sql"),
    read("supabase/functions/os-lottery/index.ts"),
    read("supabase/functions/os-stripe-webhook/index.ts"),
    read(".github/workflows/campaigns.yml"),
  ]);
  assert.match(app,/lotteryLifecycleForm/);
  assert.match(app,/lotteryCheckoutForm/);
  assert.match(data,/os-lottery/);
  assert.match(migration,/weighted-exponential-v1/);
  assert.match(migration,/This lottery draw is already finalized/);
  assert.match(migration,/os_process_lottery_expirations/);
  assert.match(migration,/revoke update on table public\.os_lottery_applications/);
  assert.match(lottery,/openstart_lottery_application_id/);
  assert.match(lottery,/os_reserve_lottery_registration/);
  assert.match(webhook,/os_confirm_lottery_registration/);
  assert.match(workflow,/expired lottery invitations/);
});

test("platform operations stay behind a server-authoritative owner boundary", async () => {
  const [platformViews,data,migration,operator,webhook] = await Promise.all([
    read("features/platform/views.js"),read("data.js"),
    read("supabase/migrations/20260729160000_platform_operations.sql"),
    read("supabase/functions/os-platform-admin/index.ts"),
    read("supabase/functions/os-stripe-webhook/index.ts"),
  ]);
  assert.match(platformViews,/PRIVATE OPERATOR CONSOLE/);
  assert.match(platformViews,/data-platform-suspend/);
  assert.match(data,/os-platform-admin/);
  assert.match(migration,/os_platform_admins/);
  assert.match(migration,/os_block_suspended_event_registration/);
  assert.match(operator,/Platform operator access is required/);
  assert.match(operator,/os_platform_scale_metrics/);
  assert.match(operator,/platform_suspend/);
  assert.match(webhook,/os_provider_events/);
});

test("public athlete profiles aggregate published results behind a security-definer boundary", async () => {
  const [app, accountViews, data, migration] = await Promise.all([
    read("app.js"),
    read("modules/account-views.js"),
    read("data.js"),
    read("supabase/migrations/20260729170000_athlete_profiles.sql"),
  ]);
  assert.match(app, /function renderAthlete/);
  assert.match(app, /accountViews\.publicAthlete\(data\)/);
  assert.match(accountViews, /function publicAthlete\(\{ profile, results \}\)/);
  assert.match(app, /athleteProfileForm/);
  assert.match(app, /params\.get\("athlete"\)/);
  assert.match(data, /getAthleteProfile/);
  assert.match(data, /saveAthleteProfile/);
  assert.match(data, /os_athlete_results/);
  assert.match(migration, /create table if not exists public\.os_athlete_profiles/);
  assert.match(migration, /security definer/);
  assert.match(migration, /"public athlete profiles are readable"/);
  // Placement is computed only over published finishers, never leaking private registrations.
  assert.match(migration, /where r\.published/);
  assert.match(migration, /grant execute on function public\.os_athlete_results\(text\) to anon, authenticated/);
});

test("the embeddable registration widget stays within the OpenStart origin and payment boundary", async () => {
  const [loader, frame, ret, app, accountViews] = await Promise.all([
    read("embed.js"),
    read("embed.html"),
    read("embed-return.html"),
    read("app.js"),
    read("modules/account-views.js"),
  ]);
  // The frame calls the same server-authoritative checkout function, with a UUID idempotency key.
  assert.match(frame, /functions\/v1\/os-create-checkout/);
  assert.match(frame, /crypto\.randomUUID\(\)/);
  // Return URLs resolve against the OpenStart origin so the allowed-origin check passes.
  assert.match(frame, /new URL\("embed-return\.html", location\.href\)/);
  assert.match(ret, /os_events\?slug=eq/);
  // The loader only injects an iframe and verifies the message origin before resizing.
  assert.match(loader, /createElement\("iframe"\)/);
  assert.match(loader, /event\.origin !== origin/);
  // Organizers can copy the snippet from the roster.
  assert.match(app, /embedSnippetForm/);
  assert.match(accountViews, /data-openstart-embed/);
});

test("no framework runtime is referenced by the application", async () => {
  const files = await Promise.all(["index.html", "app.js", "core.js", "data.js"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /(?:from\s+["'](?:next|react|vinext|vite)|@vite|__next)/i);
  assert.doesNotMatch(source, /\.tsx\b/i);
});

test("scalability hot paths use counters, bounded pages, and worker claims", async () => {
  const [app,data,migration,communications,operator] = await Promise.all([
    read("app.js"),read("data.js"),
    read("supabase/migrations/20260729180000_scalability_foundations.sql"),
    read("supabase/functions/os-communications/index.ts"),
    read("supabase/functions/os-platform-admin/index.ts"),
  ]);
  assert.match(migration,/reserved_count=reserved_count\+1/);
  assert.match(migration,/os_registration_capacity_counters/);
  assert.match(migration,/for update skip locked/);
  assert.match(migration,/os_discover_events/);
  assert.match(migration,/os_organizer_event_metrics/);
  assert.match(migration,/os_scalability_maintenance/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.os_guard_registration_integrity[\s\S]*?\$\$;/)?.[0] || "",
    /for update/i,
  );
  assert.match(data,/organizerEventMetrics/);
  assert.match(app,/ensureEventRegistrations/);
  assert.match(communications,/os_claim_campaign_deliveries/);
  assert.match(communications,/Promise\.all/);
  assert.match(operator,/counterDrift/);
});
