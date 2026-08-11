# Operator incident runbook

This runbook covers the first response to production incidents. Preserve evidence, minimize participant harm, and prefer pausing a risky workflow over guessing. Never paste secrets, full payment details, identity documents, or participant exports into issues or chat.

## Severity and first response

| Severity | Meaning | Initial response |
| --- | --- | --- |
| SEV-1 | Security exposure, widespread payment error, data loss, or registration integrity failure | Acknowledge within 15 minutes; pause affected flows; assign an incident commander |
| SEV-2 | Major workflow degraded with a workaround or limited event impact | Acknowledge within 30 minutes; notify affected organizers |
| SEV-3 | Isolated defect with no financial or data-integrity risk | Triage during the next support window |

For every incident: record start time and release, assign severity and ownership, check the operator console and provider status pages, preserve relevant IDs and timestamps, state the current customer impact, choose a containment action, and publish updates on a predictable cadence. Changes to financial records require evidence from Stripe and an audit trail.

## Payment or checkout failures

1. Check Stripe status and recent provider events in the operator console.
2. Compare the registration, Checkout Session, PaymentIntent, and connected account using IDs—not participant card data.
3. If the provider is degraded, pause paid registration for affected events and communicate the workaround.
4. Retry only idempotent operations. Never create a second payment to repair an uncertain first payment.
5. Reconcile successful Stripe payments whose registrations remain pending before reopening registration.

## Webhook delay or failure

Verify the endpoint, signing secret, response code, and event age in Stripe Workbench. Redeploy only after confirming configuration. Replay failed events from Stripe after the handler is healthy; idempotency should make replays safe. Confirm that the provider-event record and registration state converge.

## Email failure

Check Resend status, sender-domain verification, and the Email failures panel. Payment and registration truth remains in OpenStart even if a receipt is delayed. Retry a confirmation only after delivery is healthy, and suppress addresses that bounced or complained. Do not use registration exports as an ad-hoc mailing list.

## Refund discrepancy

Confirm the payment and refund directly in Stripe, then locate the matching registration. Do not mark a registration refunded based only on a participant message. If Stripe succeeded but OpenStart did not update, preserve the provider event, replay it or use the authorized refund reconciliation path, and confirm the audit entry.

## Duplicate registration or capacity breach

Pause registration for the event immediately. Preserve the affected registration IDs and timestamps. Do not delete financial records. Determine which registration has a valid payment, contact the organizer, refund or cancel through the supported workflow, and run capacity reconciliation before reopening. Escalate as SEV-1 if the database uniqueness or capacity invariant can still be bypassed.

## Application or database outage

Check GitHub Pages, Supabase, Stripe, and Resend status independently. If the static client is faulty, redeploy the last known-good commit. If Supabase is unavailable, communicate that registrations and race-day writes are paused; do not collect entries offline unless an approved reconciliation procedure exists. After recovery, inspect errors, pending payments, webhook backlog, and capacity counters.

## Event suspension

Use the platform console to suspend an event when fraud, safety, legal, or material integrity concerns require immediate containment. Record a clear internal reason and notify the organizer. Suspension hides the event and blocks new registrations but does not erase records or automatically refund payments. Restoration requires evidence that the concern is resolved.

## Communication template

> We are investigating an issue affecting **[workflow/events]** that began at **[time and timezone]**. **[Known impact]**. We have **[containment]** and will update by **[time]**. Please do not retry payment unless instructed.

## Resolution and review

Resolve only after the user-visible workflow and authoritative records agree, monitoring is stable, and affected people have been informed. Within two business days document the timeline, impact, root cause, detection gap, corrective actions, owners, and deadlines. Add a regression test or operational control whenever practical.
