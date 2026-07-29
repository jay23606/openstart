import { displayDate, escapeHtml } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";

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

  return { event, duplicate, checklist, roster };
}
