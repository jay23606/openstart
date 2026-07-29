import { displayDate, escapeHtml } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";

export function createOrganizerViews() {
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

  return { event, duplicate, checklist };
}
