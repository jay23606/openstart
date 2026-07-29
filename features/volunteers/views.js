import { escapeHtml } from "../../core.js?v=36";
import { emptyState, modalShell, renderList, summaryMetrics } from "../../modules/render.js?v=59";

export function createVolunteerViews({ getSessionEmail }) {
  function opportunities(event) {
    const shifts = (event.os_volunteer_roles || [])
      .flatMap((role) => (role.os_volunteer_shifts || []).map((shift) => ({ role, shift })))
      .filter(({ shift }) => new Date(shift.ends_at) > new Date())
      .sort((a, b) => new Date(a.shift.starts_at) - new Date(b.shift.starts_at));
    const body = `<div class="volunteer-opportunities">${renderList(shifts, ({ role, shift }) =>
      `<article><div><p>${new Date(shift.starts_at).toLocaleString()}\u2013${new Date(shift.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p><h3>${escapeHtml(role.name)}</h3><span>${escapeHtml(role.description)}</span><small>${escapeHtml(shift.location)} \u00b7 ${shift.capacity} spots${role.minimum_age ? ` \u00b7 Age ${role.minimum_age}+` : ""}</small></div><button class="primary-button" data-volunteer-shift="${shift.id}" data-event="${event.id}" type="button">Choose shift</button></article>`)
      || emptyState("No volunteer shifts are currently open.", escapeHtml)}</div>`;
    return modalShell({
      eyebrow: "Join the race-day team",
      title: `Volunteer at ${event.name}`,
      body,
      wide: true,
    }, escapeHtml);
  }

  function signup(event, shiftId) {
    const role = (event.os_volunteer_roles || [])
      .find((item) => item.os_volunteer_shifts?.some((shift) => shift.id === shiftId));
    const shift = role?.os_volunteer_shifts?.find((item) => item.id === shiftId);
    const body = `
      <div class="shift-summary"><b>${new Date(shift.starts_at).toLocaleString()}</b><span>${escapeHtml(shift.location)}</span>${role.requirements ? `<p>${escapeHtml(role.requirements)}</p>` : ""}</div>
      <form id="volunteer-signup-form" data-shift-id="${shiftId}"><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Email<input name="email" type="email" value="${escapeHtml(getSessionEmail() || "")}" required></label><label>Phone<input name="phone" type="tel"></label><label>Emergency contact<input name="emergency_contact"></label><label>Notes or accommodations<textarea name="notes" rows="3"></textarea></label>${role.waiver_text ? `<div class="waiver-box"><p>${escapeHtml(role.waiver_text)}</p><label class="check-label"><input name="waiver" type="checkbox" required> I accept the volunteer waiver</label></div>` : ""}<button class="primary-button" type="submit">Join this shift</button></form>`;
    return modalShell({
      eyebrow: role?.name || "Volunteer",
      title: "Sign up to help",
      body,
    }, escapeHtml);
  }

  function manager(event) {
    const roles = event.os_volunteer_roles || [];
    const signups = roles.flatMap((role) => (role.os_volunteer_shifts || [])
      .flatMap((shift) => (shift.os_volunteer_signups || [])
        .map((signup) => ({ role, shift, signup }))));
    const summary = summaryMetrics([
      { value: signups.filter(({ signup }) => signup.status === "confirmed").length, label: "confirmed" },
      { value: signups.filter(({ signup }) => signup.status === "waitlisted").length, label: "waitlisted" },
      { value: signups.filter(({ signup }) => signup.checked_in_at).length, label: "checked in" },
    ], escapeHtml, "volunteer-summary", `<button class="subtle-button" data-export-volunteers="${event.id}" type="button">Export CSV</button>`);
    const roleList = renderList(roles, (role) =>
      `<article><h3>${escapeHtml(role.name)}</h3>${renderList(role.os_volunteer_shifts || [], (shift) =>
        `<div><b>${new Date(shift.starts_at).toLocaleString()}</b><small>${escapeHtml(shift.location)} \u00b7 capacity ${shift.capacity} \u00b7 ${(shift.os_volunteer_signups || []).filter((item) => item.status === "confirmed").length} confirmed</small></div>`)}</article>`);
    const roster = renderList(signups, ({ role, shift, signup }) =>
      `<div data-volunteer-signup-id="${signup.id}"><span><b>${escapeHtml(signup.first_name)} ${escapeHtml(signup.last_name)}</b><small>${escapeHtml(signup.email)} \u00b7 ${escapeHtml(role.name)} \u00b7 ${new Date(shift.starts_at).toLocaleString()}</small></span><select name="status">${renderList(["confirmed", "waitlisted", "completed", "no_show", "cancelled"], (status) => `<option ${signup.status === status ? "selected" : ""}>${status}</option>`)}</select><label class="check-label"><input name="checked_in" type="checkbox" ${signup.checked_in_at ? "checked" : ""}> Checked in</label><input name="hours" type="number" min="0" step=".25" placeholder="Hours" value="${signup.hours_worked ?? ""}"></div>`);
    const body = `
      ${summary}
      <div class="volunteer-admin-list">${roleList || emptyState("No volunteer roles yet.", escapeHtml)}</div>
      <h3>Create a role and first shift</h3><form id="volunteer-role-form" data-event-id="${event.id}"><div class="split-fields"><label>Role name<input name="name" placeholder="Course marshal" required></label><label>Minimum age<input name="minimum_age" type="number" min="0"></label></div><label>Description<input name="description" required></label><label>Requirements<input name="requirements" placeholder="Comfortable standing outdoors"></label><label>Volunteer waiver<textarea name="waiver_text" rows="3"></textarea></label><div class="split-fields"><label>Starts<input name="starts_at" type="datetime-local" required></label><label>Ends<input name="ends_at" type="datetime-local" required></label></div><div class="split-fields"><label>Location<input name="location" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div><label>Shift instructions<input name="instructions"></label><button class="primary-button" type="submit">Create volunteer shift</button></form>
      <h3>Volunteer roster</h3><form id="volunteer-roster-form" data-event-id="${event.id}"><div class="volunteer-roster">${roster || emptyState("No volunteers have signed up.", escapeHtml)}</div>${signups.length ? '<button class="primary-button" type="submit">Save volunteer roster</button>' : ""}</form>`;
    return modalShell({
      eyebrow: "Volunteer operations",
      title: event.name,
      body,
      wide: true,
    }, escapeHtml);
  }

  return { manager, opportunities, signup };
}
