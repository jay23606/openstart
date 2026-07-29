import { displayDate, escapeHtml, money } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";
import { localDateTime } from "../../modules/ui.js?v=40";

export function createEventCommerceViews({ effectivePrice }) {
  function registrationSettings(event) {
    const questions = renderList(event.os_event_questions || [], (question) => `<div><span><b>${escapeHtml(question.label)}</b><small>${question.field_type}${question.required ? " · required" : ""}</small></span><button data-delete-question="${question.id}" data-event-id="${event.id}" type="button">Remove</button></div>`) || "<p>No custom questions yet.</p>";
    const body = `<form id="registration-settings-form" data-event-id="${event.id}"><label>Waiver text<textarea name="waiver_text" rows="6" placeholder="Leave blank to disable the waiver">${escapeHtml(event.waiver_text || "")}</textarea></label>
        <div class="split-fields"><label>Participant edits close<input name="participant_edits_close_at" type="datetime-local" value="${localDateTime(event.participant_edits_close_at)}"></label><label>Transfers close<input name="transfers_close_at" type="datetime-local" value="${localDateTime(event.transfers_close_at)}"></label></div>
        <label>Refund requests close<input name="refunds_close_at" type="datetime-local" value="${localDateTime(event.refunds_close_at)}"></label>
        <div class="split-fields"><label class="check-label"><input name="allow_transfers" type="checkbox" ${event.allow_transfers !== false ? "checked" : ""}> Allow transfers</label><label class="check-label"><input name="allow_refund_requests" type="checkbox" ${event.allow_refund_requests !== false ? "checked" : ""}> Allow cancellation requests</label></div>
        <button class="subtle-button" type="submit">Save self-service settings</button></form>
      <h3>Custom questions</h3><div class="question-list">${questions}</div>
      <form id="question-form" data-event-id="${event.id}"><label>Question<input name="label" placeholder="Shirt size" required></label><div class="split-fields"><label>Answer type<select name="field_type"><option value="text">Text</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></select></label><label>Dropdown choices<input name="options" placeholder="XS, S, M, L, XL"></label></div><label class="check-label"><input name="required" type="checkbox"> Required</label><button class="primary-button" type="submit">Add question</button></form>`;
    return modalShell({ eyebrow: "Registration form", title: "Questions & waiver", body }, escapeHtml);
  }

  function pricingSettings(event) {
    const tiers = renderList(event.os_event_tiers, (tier) => `<div><div><b>${escapeHtml(tier.name)}</b><small>Base ${money(tier.price_cents)} · Current ${money(effectivePrice(tier))} · Capacity ${tier.capacity}</small></div>
      <form class="scheduled-price-form" data-tier-id="${tier.id}" data-event-id="${event.id}"><input name="name" placeholder="Fall price" required><input name="price" type="number" min="0" step=".01" placeholder="Price" required><input name="starts_at" type="datetime-local" required><button class="subtle-button" type="submit">Schedule</button></form>
      <div class="price-schedule">${renderList([...(tier.os_tier_prices || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)), (price) => `<span>${escapeHtml(price.name)} · ${money(price.price_cents)} · ${displayDate(price.starts_at)} <button data-delete-price="${price.id}" data-event-id="${event.id}" type="button">×</button></span>`) || "<small>No scheduled changes.</small>"}</div></div>`);
    const promos = renderList(event.os_promo_codes || [], (promo) => `<span><b>${escapeHtml(promo.code)}</b> · ${promo.discount_type === "percent" ? `${promo.discount_value / 100}%` : money(promo.discount_value)}${promo.max_redemptions ? ` · limit ${promo.max_redemptions}` : ""}</span>`) || "<p>No promo codes yet.</p>";
    const body = `<div class="pricing-tier-list">${tiers}</div><h3>Promo codes</h3><div class="promo-list">${promos}</div>
      <form id="promo-form" data-event-id="${event.id}"><div class="split-fields"><label>Code<input name="code" required></label><label>Type<select name="discount_type"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label></div><div class="split-fields"><label>Value<input name="value" type="number" min=".01" step=".01" required></label><label>Usage limit<input name="max_redemptions" type="number" min="1"></label></div><div class="split-fields"><label>Starts<input name="starts_at" type="datetime-local"></label><label>Expires<input name="expires_at" type="datetime-local"></label></div><button class="primary-button" type="submit">Create promo code</button></form>`;
    return modalShell({ eyebrow: "Pricing & capacity", title: event.name, body, wide: true }, escapeHtml);
  }

  function productSettings(event) {
    const products = renderList(event.os_products || [], (product) => `<article><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p>${renderList(product.os_product_variants, (variant) => `<span>${escapeHtml(variant.name)} · ${money(variant.price_cents)} · ${variant.inventory === null ? "unlimited" : `${variant.inventory} inventory`}</span>`)}</article>`) || '<div class="empty-state">No products configured.</div>';
    const body = `<div class="product-admin-list">${products}</div>
      <h3>Add product</h3><form id="product-form" data-event-id="${event.id}"><label>Product name<input name="name" placeholder="Race shirt" required></label><label>Description<input name="description"></label><div class="split-fields"><label>First variant<input name="variant_name" placeholder="Medium" required></label><label>Price<input name="price" type="number" min="0" step=".01" required></label></div><div class="split-fields"><label>Inventory<input name="inventory" type="number" min="0" placeholder="Blank for unlimited"></label><label>Fulfillment<select name="fulfillment_type"><option value="packet_pickup">Packet pickup</option><option value="digital">Digital</option><option value="none">No fulfillment</option></select></label></div><button class="primary-button" type="submit">Create product</button></form>
      <h3>Donations</h3><form id="donation-settings-form" data-event-id="${event.id}"><label class="check-label"><input name="donations_enabled" type="checkbox" ${event.donations_enabled ? "checked" : ""}> Accept donations during registration</label><div class="split-fields"><label>Beneficiary<input name="beneficiary_name" value="${escapeHtml(event.beneficiary_name || "")}"></label><label>Fundraising goal<input name="fundraising_goal" type="number" min="0" step=".01" value="${event.fundraising_goal_cents ? event.fundraising_goal_cents / 100 : ""}"></label></div><button class="subtle-button" type="submit">Save fundraising settings</button></form>`;
    return modalShell({ eyebrow: "Products & fundraising", title: event.name, body, wide: true }, escapeHtml);
  }

  return { registrationSettings, pricingSettings, productSettings };
}
