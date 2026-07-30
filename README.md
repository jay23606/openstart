# OpenStart

OpenStart is an open-source race registration and event-operations platform for
organizers, runners, volunteers, race-day staff, and timing teams.

It covers the full event lifecycle—from publishing a race and accepting
registrations to check-in, results, communications, and series standings—while
keeping the client simple: static HTML, CSS, and browser-native JavaScript backed
by Supabase.

[Live application](https://jay23606.github.io/openstart/) ·
[Architecture report](https://jay23606.github.io/openstart/?view=architecture) ·
[Help center](https://jay23606.github.io/openstart/?view=help) ·
[Interactive demo](https://jay23606.github.io/openstart/?view=demo)

## Why OpenStart?

Race platforms often combine public websites, registration, payments, participant
management, and race-day tooling in a closed system. OpenStart makes those
workflows inspectable and self-hostable without requiring a frontend framework,
bundler, or application server.

- **Simple to deploy:** static assets run on GitHub Pages or any static host.
- **Server-authoritative:** PostgreSQL and Edge Functions enforce permissions,
  capacity, pricing, payments, and other critical rules.
- **Operationally complete:** organizers can work from event setup through
  published results in one platform.
- **Open and auditable:** application code, database migrations, and privileged
  workflows live in the repository.

## What it supports

### For organizers

- Guided event setup, readiness checks, publishing, duplication, and branded pages
- Registration options, scheduled pricing, promo codes, waivers, and custom questions
- Participant rosters, teams, transfers, cancellation requests, refunds, and waitlists
- Lotteries with qualification review, weighted draws, invitations, and immutable audit data
- Merchandise, inventory, donations, financial reporting, and Stripe Connect payouts
- Email campaigns, audience previews, templates, scheduling, and delivery reporting
- Waves, corrals, bib ranges, volunteers, staff roles, and race-day operations
- Timing imports, manual corrections, official results, and race-series standings

### For runners and volunteers

- Public race discovery and event pages
- Individual and group registration with hosted Stripe Checkout
- Self-service registration management, transfers, teams, and lottery status
- Signed QR passes, packet-pickup status, results, and public athlete profiles
- Volunteer opportunities, waitlists, assignments, and service history

### For platform operators

- Role-based owner, finance, and support access
- Payment and email failure monitoring
- Organizer search, reconciliation, fee controls, support notes, and event suspension
- Immutable audit history and operational health reporting

The built-in demo can create a private, disposable showcase with sample
participants, results, products, waves, volunteers, and website content. It is
excluded from real event totals and never sends payments or participant email.

## Architecture

OpenStart uses a deliberately small browser stack:

```text
Browser-native HTML, CSS, and ES modules
                    │
                    ▼
        Supabase Auth and PostgreSQL
       Row Level Security + SQL functions
                    │
                    ▼
          Supabase Edge Functions
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     Stripe Connect         Resend
```

The browser owns presentation and reversible workflow state. PostgreSQL owns
durable records and invariants. Edge Functions own secrets, privileged actions,
and provider integrations.

The client includes a small observable store and targeted reactive components
without introducing a framework. Unsaved non-sensitive forms use tab-scoped
draft storage, and compatible event settings use optimistic concurrency to
prevent stale editors from silently overwriting newer work.

Read the
[architecture report](https://jay23606.github.io/openstart/?view=architecture)
for the system model, transaction protocols, quality attributes, deployment
tradeoffs, and current limitations.

## Repository layout

```text
app.js                 Application composition and delegated browser events
core.js                Supabase configuration and shared helpers
data.js                Browser persistence boundary
features/              Domain controllers and views
modules/               State, routing, rendering, forms, and shared behavior
supabase/migrations/   PostgreSQL schema, policies, functions, and hardening
supabase/functions/    Stripe, email, platform, and race-operation boundaries
tests/                 Node and Playwright coverage
styles.css             Responsive light and dark themes
service-worker.js      PWA shell and offline asset cache
```

Feature controllers receive their dependencies explicitly and own a bounded
workflow. Views remain plain rendering functions with explicit escaping.
`app.js` composes those parts rather than containing every product behavior.

## Run locally

Requirements:

- A modern browser
- Node.js for tests
- Python, or another static file server, for local development
- Supabase CLI when deploying the backend

```bash
git clone https://github.com/jay23606/openstart.git
cd openstart
npm install
python -m http.server 8000
```

Then open `http://localhost:8000`.

Without a configured Supabase project, OpenStart runs in a device-local demo
mode. To connect a backend, copy `config.example.js` to `config.js` and provide
the Supabase project URL and public publishable key.

Never place a service-role key or provider secret in `config.js`.

## Configure Supabase

1. Create a Supabase project.
2. Link the repository with the Supabase CLI.
3. Apply all migrations:

   ```bash
   supabase db push
   ```

4. Deploy the Edge Functions used by your installation.
5. Add local and production URLs to the Supabase Auth redirect allow-list.
6. Configure email confirmation according to your account policy.

The publishable key is expected to be visible in the browser. Security comes
from Row Level Security, database constraints, and server-side authorization.

## Payments and email

Free registrations can be confirmed immediately. Paid registrations use Stripe
Connect destination charges:

1. PostgreSQL atomically reserves capacity.
2. An Edge Function creates an idempotent hosted Checkout Session.
3. Stripe routes the organizer amount and OpenStart application fee.
4. A signed webhook confirms or expires the registration.

Store provider credentials only as Supabase secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM_EMAIL="OpenStart <registrations@your-domain.com>"
```

The Stripe webhook should subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `account.updated`

For sandbox checkout, use Stripe's standard test card `4242 4242 4242 4242`,
any future expiration date, any three-digit CVC, and a valid postal code.

Resend's test sender is limited to the account owner. Verify a sending domain
before delivering confirmations or campaigns to participants.

## Registration integrity

Critical registration rules are enforced at the database boundary, including:

- one active registration per participant email and event;
- one active registration per signed-in account and event;
- atomic tier, team, wave, volunteer, product, and promotion capacity;
- event ownership checks across tiers, teams, waitlists, and orders;
- server-calculated pricing, discounts, and application fees;
- idempotent checkout and webhook processing; and
- safe release of expired registration and inventory reservations.

The browser cannot mark its own registration as paid.

## Embedding registration

Organizers can embed registration on another website:

```html
<div data-openstart-embed="your-event-slug"></div>
<script src="https://your-openstart-host/embed.js"></script>
```

Add `data-openstart-accent="#0f6b4f"` to customize the accent color. The widget
uses an iframe served from the OpenStart origin, keeping registration and
Checkout inside the same security boundary without exposing API keys to the
host site.

## Deploy to GitHub Pages

Enable GitHub Pages with **GitHub Actions** as the source. The workflow in
`.github/workflows/pages.yml` publishes the repository root without a build
step. Relative asset paths and the service-worker scope support project URLs
such as `https://owner.github.io/openstart/`.

Deploy Supabase migrations and functions separately before enabling persistent
features in production.

## Test

```bash
npm test
npm run test:e2e
npm audit --audit-level=high
```

The GitHub quality workflow runs syntax checks, unit and static tests, the
dependency audit, and Playwright browser tests before deployment.

## Security and production notes

- Keep Stripe, Resend, cron, and service-role secrets out of browser code.
- Treat interface visibility as presentation, never authorization.
- Bootstrap the first platform owner deliberately through the Supabase SQL editor.
- Run representative load tests before opening a high-demand registration window.
- Configure monitoring, reservation cleanup, payment reconciliation, backups,
  and provider alerts for production use.

## Contributing

OpenStart is intended to be inspectable, adaptable, and community maintained.
Issues and pull requests are welcome. Before contributing, run the complete
test suite and keep privileged decisions at the database or Edge Function
boundary.
