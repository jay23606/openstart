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
- Row-level security for organizer and participant data
- A provider-neutral payment boundary that leaves paid entries pending
- Installable PWA shell with an offline cache
- Device-local demo mode when Supabase has not been configured

## Files

`index.html` is the static shell. `styles.css` contains the complete responsive
design. `app.js` owns UI state and events. `data.js` is the only persistence
layer. `core.js` configures Supabase and shared helpers. `payments.js` is the
payment-provider boundary. `service-worker.js` and `manifest.json` provide PWA
support. `supabase/schema.sql` creates the database and RLS policies.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
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

`NoPaymentProvider` confirms free registrations and leaves paid registrations
in `pending` state. A real provider should be added with Supabase Edge Functions:

1. The browser requests checkout from an Edge Function.
2. The function creates the checkout using a secret API key.
3. A provider webhook is verified inside another Edge Function.
4. Only server-side code updates `payment_status` to `paid`.

The browser must never be allowed to mark its own registration as paid.

## Tests

Run `npm test`. The package contains no runtime dependencies; Node is used only
for syntax and connection tests.
