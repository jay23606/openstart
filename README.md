# OpenStart

OpenStart is an open-source race registration and event management platform.
This first version covers event discovery, tiered registration, organizer event
creation, registration metrics, and participant rosters.

## Current architecture

- Next-compatible React frontend, built with vinext for Cloudflare Workers
- Device-local demo repository so the preview works without credentials
- Supabase schema for Auth, Postgres, and row-level security in `supabase/schema.sql`
- A provider-neutral payment contract in `lib/payments.ts`

The UI intentionally labels payment totals as uncollected. `NoPaymentProvider`
will never mark a paid registration as paid. When a processor is added, checkout
creation and webhook verification should live server-side; the browser must not
be allowed to set `payment_status = 'paid'`.

## Run locally

Install dependencies and run the development script. The demo data persists in
local storage and can be restored from the organizer dashboard.

## Next implementation phase

1. Connect Supabase Auth and replace the local demo repository with queries.
2. Add a server-side checkout endpoint implementing `PaymentProvider`.
3. Add a verified webhook handler to confirm registrations atomically.
4. Add CSV roster export, custom questions, discount codes, and email receipts.

OpenStart uses the `os_` table prefix so it can coexist with other projects in a
shared Supabase account.
