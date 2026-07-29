import { escapeHtml, money } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";

export function createPlatformViews() {
  function health(healthData) {
    const body = `<div class="health-grid"><span><b class="${healthData.database ? "health-ok" : "health-bad"}">${healthData.database ? "Operational" : "Degraded"}</b>Database</span><span><b class="${healthData.stripeConfigured ? "health-ok" : "health-bad"}">${healthData.stripeConfigured ? "Configured" : "Missing"}</b>Stripe</span><span><b class="${healthData.emailConfigured ? "health-ok" : "health-bad"}">${healthData.emailConfigured ? "Configured" : "Missing"}</b>Email</span><span><b>${healthData.responseMs} ms</b>Health response</span></div><p class="health-checked">Checked ${new Date(healthData.checkedAt).toLocaleString()}</p>`;
    return modalShell({ eyebrow: "Platform status", title: "System health", body }, escapeHtml);
  }

  function suspension(event) {
    const body = `<p>Suspension removes the event from public discovery and blocks new registrations. Existing financial records remain intact.</p><form id="platform-suspend-form" data-event-id="${event.id}"><label>Internal reason<textarea name="reason" minlength="4" maxlength="500" required></textarea></label><button class="danger-button" type="submit">Suspend event</button></form>`;
    return modalShell({ eyebrow: "Platform safety control", title: `Suspend ${event.name}`, body }, escapeHtml);
  }

  function fee(event) {
    const body = `<form id="platform-event-fee-form" data-event-id="${event.id}"><label>Platform fee percentage<input name="fee_percent" type="number" min="0" max="25" step=".01" value="${event.platform_fee_bps / 100}" required></label><button class="primary-button" type="submit">Save event fee</button></form>`;
    return modalShell({ eyebrow: "Financial control", title: event.name, body }, escapeHtml);
  }

  function note({ eventId = "", organizerId = "", label = "" }) {
    const body = `<p>${escapeHtml(label)}</p><form id="platform-note-form"><input type="hidden" name="event_id" value="${eventId}"><input type="hidden" name="organizer_id" value="${organizerId}"><label>Internal note<textarea name="note" minlength="2" maxlength="2000" required></textarea></label><button class="primary-button" type="submit">Save note</button></form>`;
    return modalShell({ eyebrow: "Private support history", title: "Add note", body }, escapeHtml);
  }

  function consolePage(data) {
    const metrics = data.metrics;
    const ownerById = (id) => data.organizers.find((item) => item.id === id);
    const reconciliation = renderList(data.reconciliation, (item) => `<article><div><b>${escapeHtml(item.event_name)}</b><small>${escapeHtml(item.payment_status)} · ${escapeHtml(item.status)} · ${new Date(item.created_at).toLocaleString()}</small></div><span>${money(item.amount_cents)}<code>${escapeHtml(item.id.slice(0, 8))}</code></span></article>`) || '<div class="empty-state">No payment mismatches detected.</div>';
    const events = renderList(data.events, (event) => {
      const owner = ownerById(event.organizer_id);
      return `<article class="${event.platform_suspended_at ? "operation-suspended" : ""}"><div><b>${escapeHtml(event.name)}</b><small>${escapeHtml(owner?.email || "Unknown organizer")} · ${escapeHtml(event.status)} · ${(event.platform_fee_bps / 100).toFixed(2)}% fee</small>${event.platform_suspension_reason ? `<em>${escapeHtml(event.platform_suspension_reason)}</em>` : ""}</div><span><button class="text-button" data-platform-event-fee="${event.id}" type="button">Fee</button><button class="text-button" data-platform-event-note="${event.id}" type="button">Note</button>${event.platform_suspended_at ? `<button class="subtle-button" data-platform-restore="${event.id}" type="button">Restore</button>` : `<button class="danger-button" data-platform-suspend="${event.id}" type="button">Suspend</button>`}</span></article>`;
    }) || '<div class="empty-state">No matching events.</div>';
    const organizers = renderList(data.organizers, (item) => `<article><div><b>${escapeHtml(item.display_name || item.email)}</b><small>${escapeHtml(item.email)} · ${item.event_count} event${item.event_count === 1 ? "" : "s"} · Last sign-in ${item.last_sign_in_at ? new Date(item.last_sign_in_at).toLocaleDateString() : "never"}</small></div><span><b class="${item.stripe_charges_enabled && item.stripe_payouts_enabled ? "health-ok" : "health-bad"}">${item.stripe_charges_enabled && item.stripe_payouts_enabled ? "Stripe ready" : "Stripe incomplete"}</b><button class="text-button" data-platform-organizer-note="${item.id}" type="button">Note</button></span></article>`) || '<div class="empty-state">No matching organizers.</div>';
    const providerEvents = renderList(data.providerEvents.slice(0, 25), (item) => `<article><div><b>${escapeHtml(item.event_type)}</b><small>${new Date(item.received_at).toLocaleString()}</small></div><span class="${item.status === "failed" ? "health-bad" : "health-ok"}">${escapeHtml(item.status)}</span></article>`) || '<div class="empty-state">No provider events recorded yet.</div>';
    const failures = renderList(data.failedDeliveries.slice(0, 25), (item) => `<article><div><b>${escapeHtml(item.email)}</b><small>${escapeHtml(item.error_message || "No provider detail")}</small></div><span class="health-bad">${escapeHtml(item.status)}</span></article>`) || '<div class="empty-state">No email failures recorded.</div>';
    const notes = renderList(data.notes.slice(0, 30), (item) => `<p><span><b>${escapeHtml(item.body)}</b><small>${new Date(item.created_at).toLocaleString()}</small></span><code>${item.event_id ? "event" : "organizer"}</code></p>`) || '<div class="empty-state">No support notes yet.</div>';
    return `<section class="platform-console">
      <div class="dashboard-header"><div><p class="eyebrow">PRIVATE OPERATOR CONSOLE</p><h1>Platform operations</h1><p>Payments, organizers, delivery health, and safety controls in one place.</p></div><span class="operator-role">${escapeHtml(data.role)} access</span></div>
      <div class="metric-grid platform-metrics"><div><span>Gross processed</span><strong>${money(metrics.grossCents)}</strong><small>${money(metrics.feeCents)} platform fees</small></div><div><span>Organizers</span><strong>${metrics.organizers}</strong><small>${metrics.activeEvents} active events</small></div><div><span>Reconciliation</span><strong class="${metrics.reconciliationAlerts + metrics.counterDrift ? "health-bad" : "health-ok"}">${metrics.reconciliationAlerts + metrics.counterDrift}</strong><small>${metrics.counterDrift} capacity drift · ${metrics.reconciliationAlerts} payment alerts</small></div><div><span>Operational failures</span><strong class="${metrics.failedDeliveries + metrics.failedProviderEvents ? "health-bad" : "health-ok"}">${metrics.failedDeliveries + metrics.failedProviderEvents}</strong><small>email + provider events</small></div></div>
      <div class="platform-toolbar"><form id="platform-search-form"><label>Search organizers and events<input name="query" type="search" placeholder="Name or account email"></label><button class="subtle-button" type="submit">Search</button></form><form id="platform-default-fee-form"><label>Default fee (%)<input name="fee_percent" type="number" min="0" max="25" step=".01" value="${data.settings.default_platform_fee_bps / 100}" required></label><button class="subtle-button" type="submit">Update default</button></form></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Reconciliation alerts</h2><p>Paid records without provider references, confirmed unpaid entries, and stale pending checkouts.</p></div></div><div class="operations-list">${reconciliation}</div></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Events</h2><p>Cross-platform status, fees, and emergency controls.</p></div></div><div class="operations-list">${events}</div></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Organizers</h2><p>Stripe readiness and account activity.</p></div></div><div class="operations-list">${organizers}</div></div>
      <div class="platform-columns"><div class="dashboard-card"><div class="card-heading"><div><h2>Provider events</h2><p>Latest Stripe webhook processing.</p></div></div><div class="operations-list compact">${providerEvents}</div></div><div class="dashboard-card"><div class="card-heading"><div><h2>Email failures</h2><p>Bounces, complaints, and failed sends.</p></div></div><div class="operations-list compact">${failures}</div></div></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Support notes</h2><p>Private operator context and intervention history.</p></div></div><div class="audit-list">${notes}</div></div>
    </section>`;
  }

  return { health, suspension, fee, note, consolePage };
}
