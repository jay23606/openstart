import { displayDate, escapeHtml, money } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";
import { localDateTime, safeColor } from "../../modules/ui.js?v=40";

const setupSteps = ["Basics", "Registration options", "Runner experience", "Website", "Optional tools", "Review & publish"];

export function createOrganizerViews({ eventRegistrations, tierById }) {
  function event() {
    const body = `<form id="event-form">
      <label>Event name<input name="name" placeholder="River City 10K" required></label>
      <div class="split-fields"><label>Date<input name="date" type="date" required></label><label>Location<input name="location" placeholder="Richmond, Virginia" required></label></div>
      <label>Description<textarea name="description" rows="3" required></textarea></label>
      <h3>First registration option</h3>
      <div class="split-fields"><label>Name<input name="tier_name" placeholder="10K" required></label><label>Distance<input name="distance" placeholder="6.2 miles" required></label></div>
      <div class="split-fields"><label>Price<input name="price" type="number" min="0" step="0.01" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div>
      <p class="modal-note">OpenStart creates a private draft, then guides you through registration, payments, website content, optional tools, and a final readiness review.</p>
      <button class="primary-button" type="submit">Create draft & continue</button>
    </form>`;
    return modalShell({ eyebrow: "New event", title: "Create a starting line", body }, escapeHtml);
  }

  function duplicate(source) {
    const suggestedDate = new Date(new Date(source.starts_at).setFullYear(new Date(source.starts_at).getFullYear() + 1)).toISOString().slice(0, 10);
    const body = `<p class="modal-note">Creates a private draft with registration options, questions, waiver, website content, sponsors, products, and shifted registration deadlines. Participants, payments, results, and staff are never copied.</p>
      <form id="duplicate-event-form" data-source-event-id="${source.id}">
        <label>New event name<input name="name" value="${escapeHtml(source.name)}" required minlength="3" maxlength="120"></label>
        <label>New event date<input name="date" type="date" value="${suggestedDate}" required></label>
        <button class="primary-button" type="submit">Create draft copy</button>
      </form>`;
    return modalShell({ eyebrow: "Reusable event", title: `Duplicate ${source.name}`, body }, escapeHtml);
  }

  function checklist(source) {
    const items = [...(source.os_event_checklist_items || [])].sort((a, b) =>
      Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at))
      || new Date(a.due_at || "9999-12-31") - new Date(b.due_at || "9999-12-31")
      || a.sort_order - b.sort_order);
    const complete = items.filter((item) => item.completed_at).length;
    const percent = items.length ? Math.round(complete / items.length * 100) : 0;
    const itemCards = renderList(items, (item) => {
      const overdue = !item.completed_at && item.due_at && new Date(item.due_at) < new Date();
      return `<article class="${item.completed_at ? "complete" : ""}">
        <button class="checklist-toggle" data-toggle-checklist="${item.id}" data-event="${source.id}" data-complete="${item.completed_at ? "true" : "false"}" type="button" aria-label="${item.completed_at ? "Mark incomplete" : "Mark complete"}">${item.completed_at ? "✓" : ""}</button>
        <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.category.replaceAll("_", " "))}${item.due_at ? ` · <time class="${overdue ? "overdue" : ""}">${overdue ? "Overdue · " : ""}${displayDate(item.due_at)}</time>` : " · No due date"}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</small></span>
        <button class="icon-button" data-delete-checklist="${item.id}" data-event="${source.id}" type="button" aria-label="Delete ${escapeHtml(item.title)}">×</button>
      </article>`;
    }) || '<div class="empty-state">No checklist tasks yet.</div>';
    const body = `<div class="checklist-progress"><span><b>${complete} of ${items.length}</b> tasks complete</span><strong>${percent}% ready</strong><i><em style="width:${percent}%"></em></i></div>
      <div class="checklist-list">${itemCards}</div>
      <h3>Add a task</h3>
      <form id="checklist-item-form" data-event-id="${source.id}">
        <label>Task<input name="title" placeholder="Confirm medical team" required maxlength="180"></label>
        <div class="split-fields"><label>Category<select name="category"><option value="planning">Planning</option><option value="registration">Registration</option><option value="course">Course</option><option value="volunteers">Volunteers</option><option value="communications">Communications</option><option value="race_day">Race day</option><option value="post_event">Post-event</option><option value="operations">Other operations</option></select></label><label>Due date<input name="due_at" type="date"></label></div>
        <label>Notes<input name="notes" placeholder="Optional owner, vendor, or detail"></label>
        <button class="primary-button" type="submit">Add task</button>
      </form>`;
    return modalShell({ eyebrow: "Operational readiness", title: source.name, body, wide: true }, escapeHtml);
  }

  function roster(source) {
    const registrations = eventRegistrations(source.id);
    const participants = registrations.length ? `<div class="roster roster-manage">${renderList(registrations, (item) => `<button data-edit-registration="${item.id}" data-search="${escapeHtml(`${item.first_name} ${item.last_name} ${item.email} ${item.bib_number || ""}`.toLowerCase())}" data-status="${item.status}" type="button"><span class="avatar">${escapeHtml(item.first_name[0])}${escapeHtml(item.last_name[0])}</span><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)}</small></span><span>${escapeHtml(tierById(source, item.tier_id)?.name || "Entry")}<small>${item.bib_number ? `Bib ${escapeHtml(item.bib_number)}` : "No bib assigned"}</small></span><span>${item.status}</span></button>`)}</div>` : '<div class="empty-state">No registrations yet. Share the published event to get the first runner on the list.</div>';
    const waitlist = (source.os_waitlist || []).length ? `<div class="waitlist-list"><h3>Waitlist</h3>${renderList(source.os_waitlist, (item) => `<div><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)} · ${escapeHtml(tierById(source, item.tier_id)?.name || "")}</small></span><select data-waitlist-id="${item.id}"><option ${item.status === "waiting" ? "selected" : ""}>waiting</option><option ${item.status === "invited" ? "selected" : ""}>invited</option><option ${item.status === "registered" ? "selected" : ""}>registered</option><option ${item.status === "removed" ? "selected" : ""}>removed</option></select></div>`)}</div>` : "";
    const teams = (source.os_teams || []).length ? `<div class="team-list"><h3>Teams</h3>${renderList(source.os_teams, (team) => {
      const members = registrations.filter((item) => item.team_id === team.id && item.status !== "cancelled");
      return `<div><span><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.category)} · ${members.length}${team.max_members ? ` / ${team.max_members}` : ""} members</small></span><span>${members.map((member) => escapeHtml(`${member.first_name} ${member.last_name}`)).join(", ") || "No members"}</span></div>`;
    })}</div>` : "";
    return `<div class="dashboard-card roster-card">
      <div class="card-heading"><div><h2>${escapeHtml(source.name)} registrations</h2><p>Manage participants, volunteers, start groups, race-day details, and results.</p></div><div class="card-actions"><button class="subtle-button" data-open-setup="${source.id}" type="button">Setup guide</button><button class="subtle-button" data-lottery-manager="${source.id}" type="button">Lottery</button><button class="subtle-button" data-checklist="${source.id}" type="button">Checklist</button><button class="subtle-button" data-duplicate-event="${source.id}" type="button">Duplicate</button><button class="subtle-button" data-site-editor="${source.id}" type="button">Website</button><button class="subtle-button" data-wave-manager="${source.id}" type="button">Waves</button><button class="subtle-button" data-volunteer-manager="${source.id}" type="button">Volunteers</button><button class="subtle-button" data-results-manager="${source.id}" type="button">Results</button><button class="subtle-button" data-embed-code="${source.id}" type="button">Embed</button><button class="subtle-button" data-close-roster type="button">Close</button></div></div>
      <div class="roster-toolbar"><input data-roster-search="${source.id}" type="search" placeholder="Search name, email, or bib"><select data-roster-status="${source.id}"><option value="">All statuses</option><option>confirmed</option><option>pending</option><option>reserved</option><option>cancelled</option><option>expired</option></select><button class="subtle-button" data-add-participant="${source.id}" type="button">+ Manual entry</button><button class="subtle-button" data-export-roster="${source.id}" type="button">Export CSV</button><button class="subtle-button" data-race-day="${source.id}" type="button">Race day</button><button class="subtle-button" data-product-settings="${source.id}" type="button">Products</button><button class="subtle-button" data-pricing-settings="${source.id}" type="button">Pricing</button><button class="subtle-button" data-registration-settings="${source.id}" type="button">Form settings</button></div>
      ${participants}<div class="form-summary"><strong>${source.os_event_questions?.length || 0} custom questions</strong><span>${source.waiver_text ? "Waiver enabled" : "No waiver configured"}</span></div>${waitlist}${teams}
    </div>`;
  }

  function setup(source, step, readiness, contactEmail = "") {
    const completed = readiness.items.filter((item) => item.complete).length;
    const content = [
      `<form id="setup-basics-form" data-event-id="${source.id}" data-next-step="1"><label>Event name<input name="name" value="${escapeHtml(source.name)}" required minlength="3" maxlength="120"></label><div class="split-fields"><label>Date and time<input name="starts_at" type="datetime-local" value="${localDateTime(source.starts_at)}" required></label><label>Location<input name="location_name" value="${escapeHtml(source.location_name)}" required></label></div><label>Description<textarea name="description" rows="6" required minlength="10">${escapeHtml(source.description)}</textarea></label><button class="primary-button" type="submit">Save and continue</button></form>`,
      `<div class="setup-tier-summary">${renderList(source.os_event_tiers, (tier) => `<article><span><b>${escapeHtml(tier.name)}</b><small>${escapeHtml(tier.distance_label)}</small></span><span><b>${money(tier.price_cents)}</b><small>${tier.capacity} spots</small></span></article>`)}</div><form id="setup-tier-form" data-event-id="${source.id}"><h3>Add another registration option</h3><div class="split-fields"><label>Name<input name="name" placeholder="Half Marathon" required></label><label>Distance<input name="distance_label" placeholder="13.1 miles" required></label></div><div class="split-fields"><label>Price<input name="price" type="number" min="0" step=".01" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div><div class="dialog-actions"><button class="subtle-button" type="submit">Add option</button><button class="primary-button" data-setup-step="2" data-setup-event="${source.id}" type="button">Continue</button></div></form>`,
      `<form id="setup-runner-form" data-event-id="${source.id}" data-next-step="3"><label>Participant waiver <span class="optional-label">Strongly recommended</span><textarea name="waiver_text" rows="7" placeholder="Enter the agreement participants must accept">${escapeHtml(source.waiver_text || "")}</textarea></label><div class="split-fields"><label>Participant edits close<input name="participant_edits_close_at" type="datetime-local" value="${localDateTime(source.participant_edits_close_at)}"></label><label>Transfers close<input name="transfers_close_at" type="datetime-local" value="${localDateTime(source.transfers_close_at)}"></label></div><div class="setup-inline-actions"><button class="subtle-button" data-registration-settings="${source.id}" type="button">Manage custom questions</button><span>${source.os_event_questions?.length || 0} questions configured</span></div><button class="primary-button" type="submit">Save and continue</button></form>`,
      `<form id="setup-website-form" data-event-id="${source.id}" data-next-step="4"><div class="split-fields"><label>Brand color<input name="primary_color" type="color" value="${safeColor(source.primary_color)}"></label><label>Public contact email<input name="contact_email" type="email" value="${escapeHtml(source.contact_email || contactEmail)}"></label></div><label class="check-label"><input name="website_published" type="checkbox" ${source.website_published ? "checked" : ""}> Publish custom website sections when the event goes live</label><div class="setup-inline-actions"><button class="subtle-button" data-site-editor="${source.id}" type="button">Edit page sections and sponsors</button><span>${source.os_event_sections?.length || 0} sections configured</span></div><button class="primary-button" type="submit">Save and continue</button></form>`,
      `<div class="setup-option-grid"><article><h3>Pricing & promotions</h3><p>Scheduled prices, promo codes, and capacity.</p><button class="subtle-button" data-pricing-settings="${source.id}" type="button">Configure</button></article><article><h3>Merchandise & donations</h3><p>Products, inventory, fundraising, and fulfillment.</p><button class="subtle-button" data-product-settings="${source.id}" type="button">Configure</button></article><article><h3>Lottery</h3><p>Applications, qualification rules, and available spots.</p><button class="subtle-button" data-lottery-manager="${source.id}" type="button">Configure</button></article><article><h3>Waves & corrals</h3><p>Start times, pace ranges, capacity, and bib ranges.</p><button class="subtle-button" data-wave-manager="${source.id}" type="button">Configure</button></article><article><h3>Volunteers</h3><p>Roles, shifts, requirements, and capacity.</p><button class="subtle-button" data-volunteer-manager="${source.id}" type="button">Configure</button></article><article><h3>Readiness checklist</h3><p>Permits, course planning, communications, and race day.</p><button class="subtle-button" data-checklist="${source.id}" type="button">Open checklist</button></article></div><button class="primary-button" data-setup-step="5" data-setup-event="${source.id}" type="button">Continue to review</button>`,
      `<div class="setup-review"><div class="setup-readiness">${renderList(readiness.items, (item) => `<article class="${item.complete ? "complete" : item.required ? "required" : ""}"><i>${item.complete ? "✓" : item.required ? "!" : "○"}</i><span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.detail)}${item.required ? " · Required" : " · Optional"}</small></span></article>`)}</div><aside><p class="eyebrow">${source.status === "published" ? "EVENT IS LIVE" : readiness.ready ? "READY TO PUBLISH" : "SETUP INCOMPLETE"}</p><h3>${source.status === "published" ? "Registration is public." : readiness.ready ? "Everything required is ready." : "Finish the required items first."}</h3><p>You can preview at any time. Publishing makes the event discoverable and opens eligible registration or lottery applications.</p><button class="subtle-button" data-setup-preview="${source.id}" type="button">Preview event page</button>${source.status === "published" ? `<button class="danger-button" data-unpublish-event="${source.id}" type="button">Return to draft</button>` : `<button class="primary-button" data-publish-event="${source.id}" type="button" ${readiness.ready ? "" : "disabled"}>Publish event</button>`}</aside></div>`,
    ][step];
    return `<section class="setup-wizard"><header><button class="back-button" data-exit-setup type="button">← Organizer</button><p class="eyebrow">GUIDED EVENT SETUP</p><h1>${escapeHtml(source.name)}</h1><div><span><b>${completed}/${readiness.items.length}</b> readiness items</span><span><b>${source.status}</b> visibility</span></div></header><nav class="setup-steps" aria-label="Event setup steps">${renderList(setupSteps, (label, index) => `<button class="${index === step ? "active" : ""}" data-setup-step="${index}" data-setup-event="${source.id}" type="button"><i>${index + 1}</i><span>${label}</span></button>`)}</nav><div class="setup-content"><div><p class="eyebrow">STEP ${step + 1} OF ${setupSteps.length}</p><h2>${setupSteps[step]}</h2></div>${content}</div></section>`;
  }

  function dashboard(state, configured, eventById) {
  const realEvents = state.events.filter((event) => !event.is_showcase);
  const realEventIds = new Set(realEvents.map((event) => event.id));
  const published = realEvents.filter((event) => event.status === "published");
  const metrics=state.organizerMetrics.filter((item)=>realEventIds.has(item.event_id));
  const metricByEvent=(id)=>metrics.find((item)=>item.event_id===id) || {};
  const confirmedCount=metrics.reduce((sum,item)=>sum+Number(item.confirmed_count || 0),0);
  const gross=metrics.reduce((sum,item)=>sum+Number(item.gross_cents || 0),0);
  const discounts=metrics.reduce((sum,item)=>sum+Number(item.discount_cents || 0),0);
  const platformFees=metrics.reduce((sum,item)=>sum+Number(item.platform_fee_cents || 0),0);
  const merchandiseRevenue=metrics.reduce((sum,item)=>sum+Number(item.merchandise_cents || 0),0);
  const donationRevenue=metrics.reduce((sum,item)=>sum+Number(item.donation_cents || 0),0);
  const stripeReady = state.profile?.stripe_charges_enabled && state.profile?.stripe_payouts_enabled;
  const stripeStarted = Boolean(state.profile?.stripe_account_id);
  return `
    <section class="dashboard">
      <div class="dashboard-header">
        <div><p class="eyebrow">Organizer workspace</p><h1>Good morning, race director.</h1><p>Here’s what’s happening across your starting lines.</p></div>
        <div class="dashboard-actions">
          ${configured ? `<button class="stripe-button ${stripeReady ? "ready" : ""}" data-connect-stripe type="button">${stripeReady ? "✓ Stripe ready" : stripeStarted ? "Finish Stripe setup" : "Connect Stripe sandbox"}</button>` : ""}
          <button class="subtle-button" data-system-health type="button">System health</button>
          <button class="subtle-button" data-series-manager type="button">Series</button>
          <button class="subtle-button" data-compose-campaign type="button">Communications</button>
          <button class="primary-button" data-create-event type="button">+ Create event</button>
        </div>
      </div>
      <div class="metric-grid">
        <div><p>Confirmed registrations</p><strong>${confirmedCount}</strong><span>Across all events</span></div>
        <div><p>Published events</p><strong>${published.length}</strong><span>${realEvents.length - published.length} draft</span></div>
        <div><p>Confirmed registration value</p><strong>${money(gross)}</strong><span>Paid and free confirmed entries</span></div>
        <div><p>Estimated organizer net</p><strong>${money(gross - platformFees)}</strong><span>${money(discounts)} discounts · before Stripe fees</span></div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Your events</h2><p>Manage details and monitor signups.</p></div>${configured ? "" : '<button class="subtle-button" data-reset-demo type="button">Reset demo</button>'}</div>
        <div class="event-table">
          <div class="table-header"><span>Event</span><span>Status</span><span>Registrations</span><span>Date</span></div>
          ${realEvents.map((event) => `
            <button class="table-row" data-roster="${event.id}" type="button">
              <span><b>${escapeHtml(event.name)}</b><small>${event.status === "draft" ? "Continue guided setup" : escapeHtml(event.location_name)} · ${event.os_event_checklist_items?.filter((item) => item.completed_at).length || 0}/${event.os_event_checklist_items?.length || 0} tasks done</small></span>
              <span><i class="status-dot ${event.status}"></i>${event.status}</span>
              <span>${Number(metricByEvent(event.id).confirmed_count || 0)}</span>
              <span>${displayDate(event.starts_at)} <b>›</b></span>
            </button>`).join("")}
        </div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Financial overview</h2><p>Confirmed registration revenue and OpenStart application fees.</p></div><button class="subtle-button" data-export-finance type="button">Export financial CSV</button></div>
        <div class="revenue-categories"><span><b>${money(gross)}</b>Registrations</span><span><b>${money(merchandiseRevenue)}</b>Merchandise</span><span><b>${money(donationRevenue)}</b>Donations</span></div>
        <div class="finance-grid">${realEvents.map((event) => {
          const eventMetric=metricByEvent(event.id);
          const revenue=Number(eventMetric.gross_cents || 0);
          const fees=Number(eventMetric.platform_fee_cents || 0);
          return `<div><span>${escapeHtml(event.name)}</span><b>${money(revenue)}</b><small>${Number(eventMetric.confirmed_count || 0)} entries · ${money(revenue-fees)} estimated net</small></div>`;
        }).join("")}</div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Communications</h2><p>Drafts, scheduled messages, and delivery status.</p></div><button class="subtle-button" data-compose-campaign type="button">+ New campaign</button></div>
        <div class="campaign-list">${state.campaigns.slice(0,8).map((campaign) => `<div><span><b>${escapeHtml(campaign.name)}</b><small>${escapeHtml(eventById(campaign.event_id)?.name || "")} · ${escapeHtml(campaign.message_type)}</small></span><span>${campaign.recipient_count} recipients</span><span><b class="campaign-status">${escapeHtml(campaign.status)}</b><small>${campaign.sent_count} sent · ${campaign.failed_count} failed</small></span></div>`).join("") || '<div class="empty-state">No campaigns yet.</div>'}</div>
      </div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Race series</h2><p>Championship calendars, points, and eligibility.</p></div><button class="subtle-button" data-series-manager type="button">Manage series</button></div><div class="campaign-list">${state.series.map((series)=>`<div><span><b>${escapeHtml(series.name)}</b><small>${series.os_series_events?.length || 0} events · minimum ${series.minimum_events}</small></span><span>${escapeHtml(series.status)}</span><span><button class="subtle-button" data-configure-series="${series.id}" type="button">Configure</button></span></div>`).join("") || '<div class="empty-state">No race series yet.</div>'}</div></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Audit trail</h2><p>Recent sensitive changes across your events.</p></div></div><div class="audit-list">${state.auditLog.slice(0,15).map((entry)=>`<p><span><b>${escapeHtml(entry.action)} ${escapeHtml(entry.table_name.replace("os_","").replaceAll("_"," "))}</b><small>${escapeHtml(eventById(entry.event_id)?.name || "Event")} · ${new Date(entry.created_at).toLocaleString()}</small></span><code>${escapeHtml(entry.record_id?.slice(0,8) || "system")}</code></p>`).join("") || '<div class="empty-state">No audited changes yet.</div>'}</div></div>
      <div id="roster-slot"></div>
    </section>`;
  }

  return { event, duplicate, checklist, roster, setup, dashboard };
}
