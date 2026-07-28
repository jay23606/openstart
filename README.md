# OpenStart

OpenStart is a minimal, open-source race registration and event-management
platform. It follows the same architecture as BotGarden and Mayfly: static HTML,
CSS, and browser-native JavaScript modules on GitHub Pages, backed by Supabase.
There is no frontend framework, bundler, or build step.

## Included in the first version

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
- Device-local demo mode when Supabase has not been configured

## Files

`index.html` is the static shell. `styles.css` contains the complete responsive
design. `app.js` owns UI state and events. `data.js` is the browser persistence
boundary. `core.js` configures Supabase and shared helpers. Supabase Edge
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

## Tests

Run `npm test`. The package contains no runtime dependencies; Node is used only
for syntax and connection tests.
