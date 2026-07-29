import { escapeHtml } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";

export function createWaveViews({ eventRegistrations, tierById, resultTime }) {
  function manager(event) {
    const waves = [...(event.os_waves || [])].sort((a, b) => a.sort_order - b.sort_order);
    const waveCards = renderList(waves, (wave) => {
      const assigned = eventRegistrations(event.id).filter((registration) => registration.wave_id === wave.id);
      return `<article><div><p>${new Date(wave.starts_at).toLocaleString()}</p><h3>${escapeHtml(wave.name)}</h3><small>${escapeHtml(tierById(event, wave.tier_id)?.name || "")} · ${assigned.length}/${wave.capacity} assigned${wave.bib_start ? ` · bibs ${wave.bib_start}–${wave.bib_end}` : ""}</small></div><span>${wave.gun_started_at ? `<b>Started ${new Date(wave.gun_started_at).toLocaleTimeString()}</b>` : `<button class="subtle-button" data-start-wave="${wave.id}" data-event="${event.id}" type="button">Start now</button>`}<button class="subtle-button" data-wave-bibs="${wave.id}" data-event="${event.id}" type="button">Assign bibs</button><button data-delete-wave="${wave.id}" data-event="${event.id}" type="button">Delete</button></span></article>`;
    }) || '<div class="empty-state">Create the first start wave below.</div>';
    const waveOptions = renderList(waves, (wave) => `<option value="${wave.id}">${escapeHtml(wave.name)}</option>`);
    const tierOptions = renderList(event.os_event_tiers, (tier) => `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`);
    const runnerOptions = renderList(
      eventRegistrations(event.id).filter((item) => item.status === "confirmed" && !item.wave_id),
      (item) => `<option value="${item.id}">${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)} · ${escapeHtml(tierById(event, item.tier_id)?.name || "")}</option>`,
    );
    const body = `<div class="wave-admin-list">${waveCards}</div>
      <h3>Create wave or corral</h3>
      <form id="wave-form" data-event-id="${event.id}"><div class="split-fields"><label>Name<input name="name" placeholder="Wave 1 · Under 8:00 pace" required></label><label>Distance<select name="tier_id">${tierOptions}</select></label></div><div class="split-fields"><label>Start time<input name="starts_at" type="datetime-local" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div><div class="split-fields"><label>Minimum pace <span class="optional-label">MM:SS</span><input name="min_pace" placeholder="6:00"></label><label>Maximum pace <span class="optional-label">MM:SS</span><input name="max_pace" placeholder="8:00"></label></div><div class="split-fields"><label>First bib<input name="bib_start" type="number" min="1"></label><label>Last bib<input name="bib_end" type="number" min="1"></label></div><label>Runner selection closes<input name="selection_closes_at" type="datetime-local"></label><label class="check-label"><input name="self_select" type="checkbox" checked> Let runners choose this wave</label><button class="primary-button" type="submit">Create wave</button></form>
      <h3>Bulk assignment</h3>
      <form id="wave-assignment-form" data-event-id="${event.id}"><label>Wave<select name="wave_id">${waveOptions}</select></label><label>Unassigned participants<select name="registration_ids" multiple size="8">${runnerOptions}</select></label><button class="subtle-button" type="submit">Assign selected runners</button></form>`;
    return modalShell({ eyebrow: "Starts & corrals", title: event.name, body, wide: true }, escapeHtml);
  }

  function runner(item) {
    const waves = (item.os_events?.os_waves || [])
      .filter((wave) => wave.tier_id === item.tier_id && wave.self_select && (!wave.selection_closes_at || new Date(wave.selection_closes_at) > new Date()))
      .sort((a, b) => a.sort_order - b.sort_order);
    const waveOptions = renderList(waves, (wave) => `<option value="${wave.id}" ${item.wave_id === wave.id ? "selected" : ""}>${escapeHtml(wave.name)} · ${new Date(wave.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</option>`);
    const body = `<form id="runner-wave-form" data-event-id="${item.event_id}" data-registration-id="${item.id}"><label>Wave<select name="wave_id" required>${waveOptions}</select></label><label>Estimated pace per mile<input name="estimated_pace" value="${item.estimated_pace_seconds ? resultTime(item.estimated_pace_seconds * 1000) : ""}" placeholder="9:30"></label><button class="primary-button" type="submit">Save start wave</button></form>`;
    return modalShell({ eyebrow: "Start assignment", title: "Choose your wave", body }, escapeHtml);
  }

  return { manager, runner };
}
