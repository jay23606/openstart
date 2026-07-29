import { escapeHtml } from "../../core.js?v=36";
import { emptyState, modalShell, renderList, summaryMetrics } from "../../modules/render.js?v=59";

export function createRaceDayViews({ eventRegistrations }) {
  function results(items) {
    if (!items.length) return emptyState("No matching participants.", escapeHtml);
    return `<div class="race-day-results">${renderList(items, (item) => {
      const products = item.os_orders?.os_order_items
        ?.filter((orderItem) => orderItem.item_type === "product") || [];
      return `<div><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)} \u00b7 ${escapeHtml(item.os_event_tiers?.name || "")} \u00b7 Bib ${escapeHtml(item.bib_number || "\u2014")}${item.os_waves?.name ? ` \u00b7 ${escapeHtml(item.os_waves.name)}` : ""}</small>${renderList(products, (product) => `<small class="fulfillment-item">${escapeHtml(product.name)} \u00d7 ${product.quantity} <button data-fulfill-item="${product.id}" type="button">${product.fulfilled_at ? "\u2713 Fulfilled" : "Mark fulfilled"}</button></small>`)}</span><span class="checkin-actions"><button class="subtle-button" data-pickup="${item.id}" type="button">${item.packet_picked_up_at ? "\u2713 Packet" : "Mark packet"}</button><button class="primary-button" data-checkin="${item.id}" type="button">${item.checked_in_at ? "\u2713 Checked in" : "Check in"}</button></span></div>`;
    })}</div>`;
  }

  function manager(event) {
    const entries = eventRegistrations(event.id).filter((item) => item.status === "confirmed");
    const metrics = summaryMetrics([
      { value: entries.length, label: "Confirmed" },
      { value: entries.filter((item) => item.packet_picked_up_at).length, label: "Packets picked up" },
      { value: entries.filter((item) => item.checked_in_at).length, label: "Checked in" },
    ], escapeHtml, "race-day-metrics");
    const tiers = renderList(event.os_event_tiers || [], (tier) =>
      `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`);
    const staff = renderList(event.os_event_staff || [], (member) =>
      `<span>${escapeHtml(member.email)} \u00b7 ${escapeHtml(member.role)}</span>`);
    const body = `
      ${metrics}
      <div class="scanner-panel"><button class="primary-button" data-start-scanner="${event.id}" type="button">Scan QR pass</button><video id="qr-scanner" class="hidden" playsinline></video><p id="scanner-status"></p></div>
      <form id="race-day-lookup-form" data-event-id="${event.id}"><label>Find participant<input name="term" placeholder="Name, email, or bib" minlength="2" required></label><button class="primary-button" type="submit">Search</button></form>
      <div id="race-day-results"></div>
      <h3>Bib assignment</h3>
      <form id="bulk-bib-form" data-event-id="${event.id}"><div class="split-fields"><label>Registration option<select name="tier_id"><option value="">All options</option>${tiers}</select></label><label>Starting bib<input name="start_number" type="number" min="1" value="1" required></label></div><button class="subtle-button" type="submit">Assign unassigned bibs</button></form>
      <h3>Race-day staff</h3>
      <div class="staff-list">${staff || "<p>No staff assigned.</p>"}</div>
      <form id="staff-form" data-event-id="${event.id}"><div class="split-fields"><label>Verified account email<input name="email" type="email" required></label><label>Role<select name="role"><option value="scanner">Scanner</option><option value="packet_pickup">Packet pickup</option><option value="registration">Registration desk</option><option value="admin">Race-day admin</option></select></label></div><button class="subtle-button" type="submit">Add staff member</button></form>
      <h3>Walk-up registration</h3>
      <form id="walkup-form" data-event-id="${event.id}"><label>Entry<select name="tier_id">${tiers}</select></label><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Email<input name="email" type="email" required></label><label>Emergency contact<input name="emergency_contact" required></label><label>Bib number<input name="bib_number"></label><button class="primary-button" type="submit">Add and confirm walk-up</button></form>`;
    return modalShell({ eyebrow: "Race-day operations", title: event.name, body, wide: true }, escapeHtml);
  }

  function pass(item, passData) {
    // qrSvg is signed, server-generated markup; all database-backed labels remain escaped.
    const body = `<div class="pass-qr">${passData.qrSvg}</div><div class="registration-facts"><span><b>Race</b>${escapeHtml(item.os_events?.name || "")}</span><span><b>Bib</b>${escapeHtml(item.bib_number || "Not assigned")}</span><span><b>Entry</b>${escapeHtml(item.os_event_tiers?.name || "")}</span><span><b>Wave</b>${escapeHtml(item.os_waves?.name || "Not assigned")}</span></div><p class="pass-note">Show this code at packet pickup or check-in.</p>`;
    return modalShell({
      eyebrow: "Race-day pass",
      title: `${item.first_name} ${item.last_name}`,
      body,
      className: "pass-modal",
    }, escapeHtml);
  }

  return { manager, pass, results };
}
