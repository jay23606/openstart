# OpenStart

OpenStart is a minimal, open-source race registration and event-management
platform. It follows the same architecture as BotGarden and Mayfly: static HTML,
CSS, and browser-native JavaScript modules on GitHub Pages, backed by Supabase.
There is no frontend framework, bundler, or build step.

The browser code is split into native ES modules: `app.js` composes screens and
workflows, `data.js` owns Supabase access, `modules/router.js` owns navigation,
and feature modules such as `modules/results.js` contain independently tested
domain behavior. The remaining modules contain shared state, presentation
utilities, discovery rules, and content catalogs. This keeps the static
deployment inspectable while avoiding repeated helpers and cross-feature
dependencies.

Larger product areas live under `features/`. For example,
`features/registration/controller.js` owns registration checkout, lottery
entry, participant management, transfers, cancellations, refunds, and
confirmation actions while receiving its data and UI dependencies explicitly.
`features/organizer/controller.js` owns event creation, guided setup,
publishing, core organizer navigation, and operational checklists through the
same dependency-driven boundary.
`features/platform/controller.js` isolates platform search, fee controls,
event suspension, and private support notes from the public application shell.
`features/series/controller.js` owns championship creation, configuration,
calendar membership, public standings navigation, and standings exports.
Its `views.js` owns the series manager and calendar/settings dialogs.
`features/lottery/controller.js` owns organizer lottery configuration,
application review, irreversible draw confirmation, and invitation summaries.
`features/communications/controller.js` owns campaign composition, audience
previews, test messages, reusable templates, scheduling, drafts, and sends.
Its `views.js` owns the campaign composer and reuses the shared modal, list,
and action-toolbar primitives.
`features/results/controller.js` owns timing imports, manual corrections,
publication state, runner notifications, and public leaderboard filtering.
Its `views.js` contains the public leaderboard and organizer dialog markup.
`modules/render.js` supplies the intentionally small, framework-free rendering
layer: target replacement, list rendering, escaped empty states, and modal
shells. Feature views remain plain functions with explicit escaping.
`features/volunteers/controller.js` owns public shift signup and waitlisting,
organizer role creation, roster updates, and volunteer exports. Its `views.js`
owns the public opportunities/signup dialogs and organizer volunteer workspace.
`features/race-day/controller.js` owns participant lookup, QR passes, packet
pickup, check-in, bibs, walk-ups, staff, fulfillment, and operational exports.
Its `views.js` owns the operations workspace, lookup results, and signed pass.
`features/event-commerce/controller.js` owns waivers, custom registration
questions, scheduled pricing, promotions, merchandise, and donations.
Its `views.js` owns the registration settings, pricing, promotion, product,
inventory, and fundraising dialogs.
`features/event-site/controller.js` owns event branding, content sections,
sponsors, publishing previews, and asset uploads. `features/waves/controller.js`
owns wave creation, assignments, runner selection, starts, and bib allocation.
Its `views.js` owns the organizer corral manager and runner wave picker.

`modules/dispatcher.js` composes feature controllers for click and form
submission handling. It processes handlers in explicit order and stops after
the first feature accepts an action, keeping the application shell independent
from feature-specific `data-*` attributes.

`modules/ui-feedback.js` owns modal focus, focus restoration, keyboard trapping,
backdrop/close behavior, cleanup hooks, and accessible status/error notices.
`modules/busy.js` gives every submitted form the same duplicate-submit guard,
accessible busy state, progress label, and reliable control restoration.

## Current capabilities

- Public feature explorer plus a private, disposable organizer showcase with
  realistic sample data that stays out of real event and financial totals
- Guided six-step event setup with progressive saving, optional-tool shortcuts,
  preview, server-authoritative readiness checks, and protected publishing
- Auditable weighted lottery draws with immutable ranks, selected-runner Stripe
  checkout, expiring invitations, waitlist promotion, and runner deadlines
- Private platform-operations console with owner/finance/support roles, payment
  reconciliation alerts, provider and email failure monitoring, organizer search,
  fee controls, event suspension, support notes, and immutable intervention history
- Public event discovery and event detail pages
- Registration tiers, prices, capacity, and participant registration
- Supabase email/password authentication for organizers
- Organizer event creation, metrics, and participant rosters
- Searchable registration management, custom questions, waivers, and CSV exports
- Scheduled pricing, promotion codes, waitlists, and financial reporting
- Runner-managed participant details, cancellation requests, transfers, and refunds
- Registration activity history and automatic waitlist invitations
- Multi-person orders, itemized Stripe Checkout, teams, clubs, and relay legs
- Signed QR passes, camera scanning, bib assignment, packet pickup, and race-day check-in
- Event staff roles, walk-up registration, and race-day audit history
- Products, variants, atomic inventory, donations, and packet-pickup fulfillment
- Row-level security for organizer and participant data
- A provider-neutral payment boundary that leaves paid entries pending
- Installable PWA shell with an offline cache
- Organizer email campaigns with audience previews, reusable templates,
  scheduled delivery, delivery reporting, and marketing unsubscribe handling
- Official race results with CSV timing imports, manual corrections, searchable
  public leaderboards, division places, runner result views, and email notices
- Volunteer roles and shifts with atomic capacity enforcement, public signup,
  waitlists, waivers, organizer check-in, hours tracking, and CSV exports
- Branded event websites with image uploads, custom colors, ordered content
  sections, sponsors, draft previews, publishing controls, and social metadata
- Start waves and corrals with runner selection, capacity enforcement, pace
  guidance, bulk assignment, bib ranges, start controls, and targeted messaging
- Production safeguards including immutable audit history, server-side rate
  limits, health checks, account export/deletion, CSP, and Playwright smoke tests
- Burst-ready capacity accounting with per-tier atomic counters, narrow lock
  domains, reconciliation checks, worker-safe email claims, server-paged public
  discovery, lazy organizer rosters, and scheduled reservation cleanup
- Branded race series with event calendars, configurable placement points,
  eligibility rules, tie-breakers, individual/team standings, and CSV reporting
- Private event duplication that carries reusable registration, website,
  sponsor, merchandise, and deadline configuration into a new race date
- Operational readiness checklists with due dates, completion tracking,
  starter tasks, custom tasks, and organizer audit history
- Configurable race lotteries with application windows, distance selection,
  qualifying-result evidence, organizer review, bonus tickets, and runner
  status tracking
- Opt-in public athlete profiles that gather a runner's published results across
  every event, with personal bests per distance and per-race placement
- An embeddable registration widget that drops OpenStart checkout onto any
  external website with a single script tag
- Device-local demo mode when Supabase has not been configured

## Athlete profiles

Signed-in runners can open **My races → Athlete profile** to claim a public
handle. Their page — `?athlete=<handle>` — aggregates every published result
they earned across OpenStart events, computes a personal best per distance, and
shows overall and division placement for each race. Profiles are opt-in and can
be made private at any time. Cross-event linkage runs through a security-definer
function, so a public page never exposes private registration rows; only
published results for opted-in athletes are returned.

Placement is derived from recorded finish times. Age-graded ranking is
intentionally not offered yet: the schema does not capture runner age or gender,
so any age grade would be guesswork.

## Embedding registration

Organizers can place OpenStart registration on their own website. Open an event
roster and choose **Embed** to copy a snippet:

```html
<div data-openstart-embed="your-event-slug"></div>
<script src="https://your-openstart-host/embed.js"></script>
```

`embed.js` injects an `<iframe>` served from the OpenStart host, so the entire
registration and Stripe Checkout flow runs inside OpenStart's own origin. No
CORS rules, allowed-origin entries, or API keys need to be configured on the
host site. Add `data-openstart-accent="#0f6b4f"` to match a brand colour. The
widget auto-resizes its height via a same-origin `postMessage` handshake, and
paid entries break out to Stripe Checkout and return to a hosted confirmation
page. Because return URLs stay on the OpenStart origin, the server-side
allowed-origin check on `os-create-checkout` remains fully enforced.

## Help and sandbox use

The live app includes a searchable **Help** screen for runners, organizers,
volunteers, and race-day staff. It covers registration, payments, transfers,
results, event setup, communications, and common troubleshooting.

The **Sandbox** label in the header means Stripe is running in test mode and no
real money is charged. Use Stripe's test card `4242 4242 4242 4242`, any future
expiration date, any three-digit CVC, and a valid postal code. Do not enter real
card details until OpenStart is deliberately switched to live Stripe keys.

## Files

`index.html` is the static shell. `styles.css` contains the complete responsive
design. `app.js` composes UI workflows and delegates reusable behavior to
`modules/`. `data.js` is the browser persistence boundary. `core.js` configures
Supabase and shared helpers. Supabase Edge
Functions own Stripe secrets, Checkout, Connect onboarding, and webhooks.
`service-worker.js` and `manifest.json` provide PWA
support. `supabase/migrations/20260728150000_initial_openstart.sql` creates the
database and RLS policies.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase db push` or apply the SQL migration in the SQL editor.
3. Copy `config.example.js` to `config.js` and add the project URL and
   publishable key. Never put a service-role key in browser code.
4. Add the local and GitHub Pages URLs to the Supabase Auth redirect allow-list.
5. Decide whether email confirmation should be required.

The public publishable key is intentionally delivered to the browser. Security
comes from the RLS policies, not from hiding that key.

## GitHub Pages

Push the repository to GitHub and enable Pages with **GitHub Actions** as the
source. `.github/workflows/pages.yml` deploys the repository root without a
build step.

For a project page such as `https://owner.github.io/openstart/`, all asset URLs
are relative and the service worker scope remains inside the repository path.

## Payments

Free registrations are confirmed immediately. Paid registrations use Stripe
Connect destination charges in sandbox mode:

1. Postgres atomically reserves capacity for 30 minutes.
2. `os-create-checkout` creates a hosted Checkout Session with an idempotency key.
3. The charge is routed to the organizer and OpenStart retains the configured
   application fee.
4. `os-stripe-webhook` verifies Stripe's signature before confirming payment.
5. `os-stripe-connect` sends signed-in organizers through Stripe-hosted onboarding.

The browser must never be allowed to mark its own registration as paid.
The browser also never calculates an authoritative discount or scheduled price;
the atomic reservation function validates those values before Checkout is created.

### Registration integrity

The database, rather than the interface, enforces the core registration rules:

- one active registration per normalized participant email and event;
- one active registration per signed-in account and event;
- cancelled and expired checkout attempts may safely try again;
- open registration is rejected for lottery or closed events;
- tiers, teams, and waitlists must belong to the same event;
- tier, team, wave, volunteer, product, and promotion capacities are serialized
  at their server-side write boundaries;
- an accepted transfer cannot create a second active registration for its new
  owner; and
- expired registrations release order and inventory reservations.

Group orders remain supported, but every participant must use a distinct email.

### Stripe sandbox setup

OpenStart's database migration and Edge Functions are deployed. To activate
sandbox checkout:

1. Create a Stripe sandbox and enable Connect with Express accounts.
2. Store its sandbox secret key in Supabase:
   `supabase secrets set STRIPE_SECRET_KEY=sk_test_...`
3. In Stripe Workbench, create a webhook endpoint pointing to:
   `https://zbtgonklxweikgukzukg.supabase.co/functions/v1/os-stripe-webhook`
4. Subscribe it to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, and
   `account.updated`.
5. Store the endpoint signing secret in Supabase:
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
6. To send paid-registration confirmations, verify a sending domain with
   [Resend](https://resend.com), then store:
   `supabase secrets set RESEND_API_KEY=re_... RESEND_FROM_EMAIL="OpenStart <registrations@your-domain.com>"`

The secrets take effect without a redeploy. They must never be committed to
GitHub or placed in `config.js`.

## Organizer communications

Organizers can send transactional race updates or opted-out-aware marketing
campaigns to confirmed runners, registration options, teams, captains,
waitlists, and race-day status groups. Sends are materialized into delivery
rows for reporting and processed in batches by `os-communications`.

The scheduled GitHub Action requires the same random secret in both places:

`supabase secrets set CAMPAIGN_CRON_SECRET=...`

`gh secret set CAMPAIGN_CRON_SECRET`

Resend's test sender can only deliver to the account owner. Verify a sending
domain and set `RESEND_FROM_EMAIL` before sending campaigns to participants.

New events default to a 5% OpenStart application fee. The value is stored as
`platform_fee_bps` on each event and can be changed before registrations open.

## Platform operations

The private **Platform** navigation item is returned only to active members of
`os_platform_admins`. Bootstrap the first owner from the Supabase SQL editor,
then manage future access deliberately:

```sql
insert into public.os_platform_admins(user_id, role)
select id, 'owner' from auth.users where email = 'owner@example.com';
```

Roles are `owner`, `finance`, and `support`. Only owners can suspend or restore
events. Owner and finance roles can change platform fees. The Edge Function
rechecks the role for every request; hiding the navigation item is not the
security boundary.

## Tests

Run `npm test`. The package contains no runtime dependencies; Node is used only
for syntax and connection tests.
