import { displayDate, escapeHtml } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";
import { safeColor, safeUrl } from "../../modules/ui.js?v=40";

export function createSeriesViews({ getEvents, getSeries }) {
  function manager() {
    const seriesList = getSeries();
    const body = `<div class="series-admin-list">${renderList(seriesList, (series) => `<button data-configure-series="${series.id}" type="button"><span><b>${escapeHtml(series.name)}</b><small>${series.os_series_events?.length || 0} events · ${escapeHtml(series.status)}</small></span><strong>Configure →</strong></button>`) || '<div class="empty-state">Create your first multi-event series.</div>'}</div>
      <h3>Create series</h3>
      <form id="series-form"><label>Name<input name="name" placeholder="OpenStart Summer Series" required></label><label>Description<textarea name="description" rows="3" required></textarea></label><div class="split-fields"><label>Minimum events<input name="minimum_events" type="number" min="1" value="2" required></label><label>Tie breaker<select name="tie_breaker"><option value="most_wins">Most wins</option><option value="best_finish">Best finish</option><option value="most_events">Most events</option></select></label></div><button class="primary-button" type="submit">Create series</button></form>`;
    return modalShell({ eyebrow: "Championships", title: "Race series", body, wide: true }, escapeHtml);
  }

  function settings(series) {
    const linked = new Set((series.os_series_events || []).map((link) => link.event_id));
    const statuses = renderList(["draft", "published", "archived"], (status) => `<option ${series.status === status ? "selected" : ""}>${status}</option>`);
    const calendar = renderList(
      [...(series.os_series_events || [])].sort((a, b) => a.sort_order - b.sort_order),
      (link) => `<span><b>${escapeHtml(link.os_events?.name || "")}</b><small>${Number(link.points_multiplier)}× points</small><button data-remove-series-event="${link.id}" data-series="${series.id}" type="button">Remove</button></span>`,
    ) || "<p>No events linked.</p>";
    const availableEvents = renderList(
      getEvents().filter((event) => !linked.has(event.id)),
      (event) => `<option value="${event.id}">${escapeHtml(event.name)}</option>`,
    );
    const body = `<form id="series-settings-form" data-series-id="${series.id}">
        <label>Description<textarea name="description" rows="3">${escapeHtml(series.description)}</textarea></label>
        <div class="split-fields"><label>Brand color<input name="primary_color" type="color" value="${safeColor(series.primary_color)}"></label><label>Status<select name="status">${statuses}</select></label></div>
        <div class="split-fields"><label>Minimum completed events<input name="minimum_events" type="number" min="1" value="${series.minimum_events}" required></label><label>Tie breaker<select name="tie_breaker"><option value="most_wins" ${series.tie_breaker === "most_wins" ? "selected" : ""}>Most wins</option><option value="best_finish" ${series.tie_breaker === "best_finish" ? "selected" : ""}>Best finish</option><option value="most_events" ${series.tie_breaker === "most_events" ? "selected" : ""}>Most events</option></select></label></div>
        <label>Placement points <span class="optional-label">Comma separated</span><input name="points_schedule" value="${escapeHtml((series.points_schedule || []).join(","))}"></label>
        <label>Finisher points after listed places<input name="participation_points" type="number" min="0" value="${series.participation_points}"></label>
        <div class="split-fields"><label>Logo URL<input name="logo_url" type="url" value="${escapeHtml(series.logo_url || "")}"></label><label>Banner URL<input name="banner_url" type="url" value="${escapeHtml(series.banner_url || "")}"></label></div>
        <button class="primary-button" type="submit">Save series settings</button>
      </form>
      <h3>Series calendar</h3><div class="series-event-admin">${calendar}</div>
      <form id="series-event-form" data-series-id="${series.id}"><div class="split-fields"><label>Add event<select name="event_id">${availableEvents}</select></label><label>Points multiplier<input name="points_multiplier" type="number" min=".1" step=".1" value="1"></label></div><button class="subtle-button" type="submit">Add event</button></form>
      ${series.status === "published" ? `<button class="subtle-button" data-view-series="${series.id}" type="button">View public series</button>` : ""}`;
    return modalShell({ eyebrow: "Series settings", title: series.name, body, wide: true }, escapeHtml);
  }

  function publicPage(series, standings) {
    const events = [...(series.os_series_events || [])].sort((a, b) => a.sort_order - b.sort_order);
    return `<section class="series-page" style="--series-color:${safeColor(series.primary_color)}">
      <button class="back-button" data-back type="button">← All events</button>
      ${safeUrl(series.banner_url) ? `<div class="series-banner"><img src="${escapeHtml(safeUrl(series.banner_url))}" alt=""></div>` : ""}
      <div class="series-hero">${safeUrl(series.logo_url) ? `<img src="${escapeHtml(safeUrl(series.logo_url))}" alt="${escapeHtml(series.name)} logo">` : ""}<p class="eyebrow">Race series</p><h1>${escapeHtml(series.name)}</h1><p>${escapeHtml(series.description)}</p><div><span><b>${events.length}</b>events</span><span><b>${series.minimum_events}</b>required</span><span><b>${escapeHtml(series.tie_breaker.replace("_", " "))}</b>tie-breaker</span></div></div>
      <section class="series-calendar"><div class="section-heading"><div><p class="eyebrow">Series calendar</p><h2>Earn points at every finish</h2></div></div><div>${events.map((link) => `<article><time>${displayDate(link.os_events?.starts_at)}</time><span><b>${escapeHtml(link.os_events?.name || "")}</b><small>${escapeHtml(link.os_events?.location_name || "")} · ${Number(link.points_multiplier)}× points</small></span>${link.os_events?.status === "published" ? `<button data-event-id="${link.event_id}" type="button">View race</button>` : ""}</article>`).join("") || '<div class="empty-state">Events are coming soon.</div>'}</div></section>
      <section class="standings-section"><div class="section-heading"><div><p class="eyebrow">Championship</p><h2>Individual standings</h2></div><button class="subtle-button" data-export-series="${series.id}" type="button">Export standings</button></div><div class="standings-table"><div class="standings-header"><span>Rank</span><span>Athlete</span><span>Events</span><span>Wins</span><span>Points</span></div>${standings.individual.map((row) => `<div><span>${row.rank}</span><span><b>${escapeHtml(row.firstName)} ${escapeHtml(row.lastName)}</b><small>${row.eligible ? "Championship eligible" : `${series.minimum_events - row.eventsCompleted} more required`}</small></span><span>${row.eventsCompleted}</span><span>${row.wins}</span><span><b>${row.points}</b></span></div>`).join("") || '<div class="empty-state">Standings appear after published results.</div>'}</div></section>
      ${standings.teams.length ? `<section class="standings-section"><div class="section-heading"><div><p class="eyebrow">Clubs & teams</p><h2>Team standings</h2></div></div><div class="standings-table team-standings"><div class="standings-header"><span>Rank</span><span>Team</span><span>Members</span><span>Events</span><span>Points</span></div>${standings.teams.map((row) => `<div><span>${row.rank}</span><span><b>${escapeHtml(row.name)}</b></span><span>${row.members}</span><span>${row.eventsCompleted}</span><span><b>${row.points}</b></span></div>`).join("")}</div></section>` : ""}
    </section>`;
  }

  return { manager, publicPage, settings };
}
