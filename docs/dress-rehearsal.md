# Dress rehearsal

A full-dress run of one event, end to end, as the people who use it. This is the
cheapest way to find the class of bug that unit tests cannot: features that are
complete, deployed, and silently do nothing against real infrastructure.

Work top to bottom in one sitting. For each step, the **Proves** line is the
observable that means it actually worked — not that the screen looked right.
Record anything that surprises you at the bottom rather than fixing it midway;
stopping to fix loses the thread.

Budget about two hours. Use a real phone for anything marked 📱.

---

## 0. Preflight

Several steps fail in confusing ways if a secret is missing, so confirm these
first. Missing values produce "not configured" errors that look like bugs.

| Secret | Needed by | Symptom if unset |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | paid checkout, refunds | "Stripe sandbox has not been configured" |
| `STRIPE_WEBHOOK_SECRET` | payment confirmation | webhook 503; registrations stay `reserved` |
| `RACE_DAY_SIGNING_SECRET` | QR passes, scanning | `get_pass` returns 503 |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | all email | sends skipped, logged only |
| `CAMPAIGN_CRON_SECRET` | scheduled campaigns | the GitHub Action 401s |

```bash
supabase secrets list --project-ref zbtgonklxweikgukzukg
```

Two traps worth knowing before you start:

- **Resend's test sender only delivers to the account owner.** Until you verify a
  sending domain, mail to `runner@example.com` silently goes nowhere. Use
  addresses you actually control, or expect to verify delivery in logs instead.
- **The database enforces one active registration per email per event, and a
  signed-in account's email must match the registration email.** So you cannot
  register yourself twice. Have 2–3 real addresses ready (Gmail `+` aliases work).

Confirm the discovery region migration is applied — everything in step 4 depends
on it:

```bash
ANON="<your publishable key>"
curl -s -X POST "https://zbtgonklxweikgukzukg.supabase.co/rest/v1/rpc/os_discover_events" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_query":"%","p_limit":50}'
```

**Proves:** returns `[]`. If it returns events, the old `ILIKE` version is still
live and region sorting does nothing.

---

## 1. Organizer setup

Sign in as an organizer and walk the six-step wizard. Do not skip the optional
tools — they are where configuration is most likely to be wrong.

- Create the event: name, date ~60 days out, and a location written the normal
  way, `Boulder, CO`.
- Add two tiers with **different prices**, one with a deliberately small capacity
  (2) so you can exhaust it later.
- Add a custom question (required), a waiver, and a scheduled price change.
- Add a promo code.

**Proves:** each step persists after a page reload. Progressive saving means a
half-finished wizard should survive refresh — reload deliberately at step 3.

📱 **Also check:** the setup wizard on a phone. It is dense and rarely used there.

---

## 2. Stripe Connect

From the organizer dashboard, start onboarding and complete the Stripe-hosted
flow with test data.

**Proves:** your `os_profiles` row has `stripe_account_id` set and
`stripe_charges_enabled = true`. That flag is written by the `account.updated`
webhook, not by the browser — if it never flips, the webhook is not reaching you,
and every paid registration will fail later with "This organizer has not
connected Stripe."

---

## 3. Publish

Run the readiness check and publish.

**Proves:** publishing is refused while something required is missing (remove the
waiver and try, then restore it). The check is server-authoritative, so a browser
that hides the button is not the boundary being tested.

---

## 4. Discovery

Sign out. Find the event as a stranger would.

- Search by name, then by city.
- Use **Use my location**, then clear it and type `Boulder, CO` manually.
- Page past the first 12 results if you have enough events.

**Proves:** with a region set, events in that state sort ahead of sooner events
elsewhere. This is the exact behaviour that was broken in production — a page
that merely *renders* is not evidence. If ordering never changes, the migration
from step 0 is not applied.

📱 **Also check:** the bottom nav shows all six items in one row, and the location
prompt does not fire until you tap the button.

---

## 5. Free registration

Register for a **$0** tier (add one temporarily if needed).

**Proves:** confirmed immediately with no Stripe round trip, and the confirmation
email arrives. Free entries skip the webhook entirely, so this isolates the email
path from the payment path — if mail fails here, do not go hunting in Stripe
later.

---

## 6. Paid registration and the webhook

The most important step. Register a **different** person for a paid tier.

- Apply the promo code; confirm the discount is calculated **server-side** (the
  amount at Stripe should match, not the browser's arithmetic).
- Pay with `4242 4242 4242 4242`, any future expiry, any CVC.

**Proves:**
- the registration flips `reserved` → `confirmed` and `payment_status = paid`;
- `stripe_payment_intent_id` is populated;
- the confirmation email arrives **with a QR pass attached**;
- `os_provider_events` has one row for the event, `status = processed`.

Then the part nobody tests — **replay it**:

```bash
stripe events resend <event_id>
```

**Proves:** still exactly one confirmed registration and no second email. This
exercises the idempotency short-circuit directly.

Now the failure path. Start a second paid registration and **abandon it** at the
Stripe page.

**Proves:** the reservation expires (30 minutes) and the held capacity is
released rather than leaked. Check `reserved_count` on the tier before and after.

---

## 7. Capacity and waitlist

Fill the small-capacity tier, then try to register once more.

**Proves:** the sold-out rejection comes from the database, not the interface —
and the waitlist offer appears. Join the waitlist, then cancel a confirmed
registration as the organizer.

**Proves:** the next waitlisted person is invited automatically and receives mail.

---

## 8. Runner self-service

As a confirmed runner: edit your details, request a transfer, accept it from a
second account, then request cancellation and refund it as the organizer.

**Proves:**
- the transfer link expires and cannot be reused;
- the accepting account does not end up with two active registrations;
- the refund reaches Stripe (`stripe_refund_id` set, visible in the dashboard)
  and the application fee is reversed.

---

## 9. Race day 📱

Assign bibs in bulk. Open the QR pass on a phone. Scan it with a second device as
staff.

**Proves:** the pass scans, check-in records who scanned it, and a **modified**
token is rejected. Change one character of the token and retry — the signature
check is the security boundary here.

Also add a staff member by email and confirm they can scan but cannot, say,
change fees.

---

## 10. Results

Import a CSV of finishers, correct one manually, publish.

**Proves:** the public leaderboard shows division places, the runner sees their
own result, and result notification email arrives.

---

## 11. Communications

Send a transactional update to confirmed runners. Then schedule a marketing
campaign and wait for the cron to pick it up (runs every 5 minutes).

**Proves:** the audience preview count matches who actually receives it,
unsubscribed recipients are excluded from marketing but **still** receive
transactional mail, and delivery rows report status.

---

## 12. Platform console

Sign in as the platform owner. Suspend the event.

**Proves:** registration is refused while suspended, the suspension is recorded
in immutable audit history, and a non-owner (finance/support) cannot suspend.
Restore it afterwards.

---

## 13. Embed

Drop the widget on a scratch HTML page served from a **different** origin.

**Proves:** it renders, resizes, and completes a registration without console
errors — the iframe is the boundary that keeps checkout on OpenStart's origin.

---

## Record what broke

For each surprise, note: what you did, what you expected, what happened, and
whether it is visible to a runner or only to an organizer. Runner-visible issues
are the ones to fix first.

| # | Step | Expected | Actual | Runner-visible? |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Anything found here deserves a regression test at the layer it broke — SQL rules
into `supabase/tests/`, edge-function behaviour into a Deno test, client logic
into `tests/`. A bug found by hand and fixed without a test will come back.
