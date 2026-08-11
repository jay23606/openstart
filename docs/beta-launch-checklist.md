# Public beta launch checklist

This checklist is the release gate for allowing real organizers and runners to use OpenStart. A launch is **go** only when every blocking item is checked, assigned, and evidenced. Record links to the release, workflow runs, provider dashboards, and rehearsal notes alongside the launch decision.

## Release and infrastructure

- [ ] The intended commit is deployed to GitHub Pages and its release identifier is recorded.
- [ ] Database migrations and Edge Functions are deployed to the production Supabase project.
- [ ] The quality workflow passes, including unit, static, public browser, authenticated browser, and accessibility tests.
- [ ] The production health endpoint reports database, Stripe, and email as configured.
- [ ] A controlled load test in the isolated test project meets the documented thresholds.
- [ ] Database backups are enabled and a restore has been rehearsed outside production.
- [ ] Monitoring and provider alerts have an owner who can respond during the launch window.

## Payments and email

- [ ] Stripe is in the intended mode, Connect is enabled, and no test credentials are present in production secrets.
- [ ] The production webhook destination is active and its signing secret matches Supabase.
- [ ] One low-value end-to-end registration, payment, refund, and reconciliation rehearsal succeeds.
- [ ] Resend uses a verified sender domain and registration receipts reach major inbox providers.
- [ ] Failed payment and email events appear in the private operator console.

## Product and trust

- [ ] Runner registration, duplicate prevention, capacity, cancellation, transfer, and refund paths have been rehearsed.
- [ ] Organizer event creation, publishing, roster export, communications, check-in, and results have been rehearsed.
- [ ] Privacy policy, terms, refund policy, acceptable-use policy, and support contact are reviewed and published.
- [ ] Data-retention and account-deletion procedures have named owners.
- [ ] Manual keyboard, screen-reader, zoom, contrast, and mobile checks in `docs/accessibility.md` are complete.
- [ ] Help content and the private feedback form are visible and understandable without an account.

## Operations

- [ ] The incident commander, technical responder, payment responder, and communications owner are named.
- [ ] The operator runbook has been rehearsed with one payment and one outage scenario.
- [ ] Rollback steps for the static client, functions, and schema are understood; irreversible migrations are excluded from the launch window.
- [ ] Launch-day support coverage and escalation channels are scheduled.
- [ ] Organizers in the beta understand that the product is a beta and know how to report problems.

## Stop conditions

The decision is **no-go**, or registration is paused, if any of these is true:

- payment status cannot be reconciled with Stripe;
- capacity can be exceeded or duplicate active registrations can be created;
- unauthorized users can read or change private records;
- provider secrets or participant-sensitive data are exposed;
- backups, monitoring, or incident ownership are missing;
- the current release has a failing required quality gate.

After launch, review errors, payment mismatches, email failures, capacity drift, and beta feedback at least daily for the first week. Hold a 24-hour and seven-day launch review and convert every material finding into an owned issue.
