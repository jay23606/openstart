import { displayDate, escapeHtml } from "../../core.js?v=36";
import { emptyState, modalShell, renderList, renderMarkup } from "../../modules/render.js?v=58";
import { rankResults } from "../../modules/results.js?v=43";
import { resultTime } from "../../modules/ui.js?v=40";

export function createResultsViews({ page, eventRegistrations, tierById }) {
  function publicPage(event) {
    const rows = rankResults(event.os_results || []);
    const resultRows = renderList(rows, (item) => `<div class="result-row" data-result-tier="${item.tier_id}" data-result-search="${escapeHtml(`${item.first_name} ${item.last_name} ${item.bib_number || ""}`.toLowerCase())}">
      <span>${item.overallPlace || "\u2014"}</span>
      <span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>Bib ${escapeHtml(item.bib_number || "\u2014")} \u00b7 ${escapeHtml(tierById(event, item.tier_id)?.name || "")}${item.wave_id ? ` \u00b7 ${escapeHtml(event.os_waves?.find((wave) => wave.id === item.wave_id)?.name || "")}` : ""}</small></span>
      <span>${escapeHtml(item.division || "Open")}${item.divisionPlace ? `<small>${item.divisionPlace} in division</small>` : ""}</span>
      <span><b>${item.status === "finisher" ? resultTime(item.chip_time_ms ?? item.gun_time_ms) : item.status.toUpperCase()}</b></span>
      <span>${item.status === "finisher" ? resultTime(item.gun_time_ms) : "\u2014"}</span>
    </div>`);
    return `<section class="results-page">
      <button class="back-button" data-event-id="${event.id}" type="button">\u2190 Event details</button>
      <div class="results-hero"><div><p class="eyebrow">Official results</p><h1>${escapeHtml(event.name)}</h1><p>${displayDate(event.starts_at)} \u00b7 ${escapeHtml(event.location_name)}</p></div><strong>${rows.filter((item) => item.status === "finisher").length}<span>finishers</span></strong></div>
      <div class="results-toolbar"><input data-results-search type="search" placeholder="Search name or bib"><select data-results-tier><option value="">All distances</option>${renderList(event.os_event_tiers, (tier) => `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`)}</select></div>
      <div class="results-table"><div class="results-header"><span>Place</span><span>Runner</span><span>Division</span><span>Chip time</span><span>Gun time</span></div>
        ${resultRows || emptyState("No published results yet.", escapeHtml)}
      </div>
    </section>`;
  }

  function manager(event) {
    const current = new Map((event.os_results || []).map((item) => [item.registration_id, item]));
    const participants = eventRegistrations(event.id).filter((item) => item.status === "confirmed");
    const entries = renderList(participants, (registration) => {
      const result = current.get(registration.id);
      return `<div class="result-entry" data-registration-id="${registration.id}"><span><b>${escapeHtml(registration.first_name)} ${escapeHtml(registration.last_name)}</b><small>Bib ${escapeHtml(registration.bib_number || "\u2014")} \u00b7 ${escapeHtml(tierById(event, registration.tier_id)?.name || "")}</small></span><label>Chip time<input name="chip_time" value="${resultTime(result?.chip_time_ms).replace("\u2014", "")}" placeholder="24:31"></label><label>Gun time<input name="gun_time" value="${resultTime(result?.gun_time_ms).replace("\u2014", "")}" placeholder="25:02"></label><label>Status<select name="result_status">${renderList(["finisher", "dnf", "dns", "dq"], (status) => `<option ${result?.status === status ? "selected" : ""}>${status}</option>`)}</select></label><label>Division<input name="division" value="${escapeHtml(result?.division || "")}" placeholder="M30-39"></label></div>`;
    });
    const body = `
      <div class="result-publish-state"><b>${event.results_published_at ? "Results are public" : "Results are not published"}</b><span>${(event.os_results || []).length} saved results</span></div>
      <details class="csv-import"><summary>Import timing CSV</summary><p>Columns: <code>bib,chip_time,gun_time,status,division</code>. Times accept <code>MM:SS</code> or <code>HH:MM:SS</code>.</p><input id="results-csv-file" type="file" accept=".csv,text/csv"><textarea id="results-csv" rows="6" placeholder="bib,chip_time,gun_time,status,division&#10;101,24:31,25:02,finisher,M30-39"></textarea><button class="subtle-button" data-import-results="${event.id}" type="button">Import CSV</button></details>
      <form id="results-form" data-event-id="${event.id}">
        <div class="result-entry-list">${entries || emptyState("There are no confirmed participants.", escapeHtml)}</div>
        <button class="primary-button" type="submit">Save corrections</button>
      </form>
      <div class="dialog-actions"><button class="subtle-button" data-unpublish-results="${event.id}" type="button">Unpublish</button><button class="subtle-button" data-notify-results="${event.id}" type="button">Email unnotified runners</button><button class="primary-button" data-publish-results="${event.id}" type="button">Publish results</button></div>`;
    return modalShell({
      eyebrow: "Timing & scoring",
      title: `${event.name} results`,
      body,
      wide: true,
    }, escapeHtml);
  }

  return {
    manager,
    publicPage,
    renderPage: (event) => renderMarkup(page, publicPage(event)),
  };
}
