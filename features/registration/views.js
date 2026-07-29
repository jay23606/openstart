import { displayDate, escapeHtml, money } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";

export function createRegistrationViews({ effectivePrice, getLocation, getSessionEmail }) {
  function participantFields(event, index) {
    const questions = [...(event.os_event_questions || [])].sort((a, b) => a.sort_order - b.sort_order);
    const waves = [...(event.os_waves || [])].filter((wave) => wave.published && wave.self_select && (!wave.selection_closes_at || new Date(wave.selection_closes_at) > new Date())).sort((a, b) => a.sort_order - b.sort_order);
    const defaultTier = event.os_event_tiers[0]?.id;
    const tiers = renderList(event.os_event_tiers, (tier) => `<option value="${tier.id}">${escapeHtml(tier.name)} · ${money(effectivePrice(tier))}</option>`);
    const waveField = waves.length ? `<div class="split-fields"><label>Start wave<select data-field="wave_id"><option value="">Assign me automatically</option>${renderList(waves, (wave) => `<option value="${wave.id}" data-tier="${wave.tier_id}" ${wave.tier_id !== defaultTier ? "hidden" : ""}>${escapeHtml(wave.name)} · ${new Date(wave.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</option>`)}</select></label><label>Estimated pace per mile<input data-field="estimated_pace" placeholder="9:30"></label></div>` : "";
    const questionFields = renderList(questions, (question) => {
      if (question.field_type === "select") return `<label>${escapeHtml(question.label)}<select data-question-id="${question.id}" ${question.required ? "required" : ""}><option value="">Choose one</option>${renderList(question.options || [], (option) => `<option>${escapeHtml(option)}</option>`)}</select></label>`;
      if (question.field_type === "checkbox") return `<label class="check-label"><input data-question-id="${question.id}" type="checkbox" value="Yes" ${question.required ? "required" : ""}> ${escapeHtml(question.label)}</label>`;
      return `<label>${escapeHtml(question.label)}<input data-question-id="${question.id}" ${question.required ? "required" : ""}></label>`;
    });
    return `<fieldset class="participant-block" data-participant-index="${index}"><legend>Participant ${index + 1}</legend>
      <label>Event<select data-field="tier_id" required>${tiers}</select></label>${waveField}
      <div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div>
      <label>Email<input name="email" type="email" required></label>${questionFields}
      <label>Emergency contact<input name="emergency_contact" placeholder="Name · phone" required></label>
      <label>Relay leg <span class="optional-label">Optional</span><input name="relay_leg" placeholder="Leg 1"></label>
      ${event.waiver_text ? `<div class="waiver-box"><strong>Participant waiver</strong><p>${escapeHtml(event.waiver_text)}</p></div><label class="check-label"><input name="waiver" type="checkbox" required> This participant accepts the waiver.</label>` : ""}
      ${index ? '<button class="remove-participant" data-remove-participant type="button">Remove participant</button>' : ""}
    </fieldset>`;
  }

  function registration(event) {
    const teams = renderList(event.os_teams || [], (team) => `<option value="${team.id}">${escapeHtml(team.name)} · ${escapeHtml(team.category)}</option>`);
    const products = renderList((event.os_products || []).filter((product) => product.active), (product) => `<div><span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.description)}</small></span><select data-product-variant><option value="">No thanks</option>${renderList(product.os_product_variants, (variant) => `<option value="${variant.id}">${escapeHtml(variant.name)} · ${money(variant.price_cents)}${variant.inventory !== null ? ` · ${variant.inventory} total` : ""}</option>`)}</select><input data-product-quantity type="number" min="1" max="10" value="1" aria-label="${escapeHtml(product.name)} quantity"></div>`);
    const productSection = products ? `<h3>Add-ons</h3><div class="product-options">${products}</div>` : "";
    const donationSection = event.donations_enabled ? `<h3>Support ${escapeHtml(event.beneficiary_name || event.name)}</h3><div class="donation-fields"><label>Donation amount<input name="donation_amount" type="number" min="0" step=".01" placeholder="0.00"></label><label>Dedication or message<input name="dedication" maxlength="300"></label><label class="check-label"><input name="anonymous_donation" type="checkbox"> Make this donation anonymous</label></div>` : "";
    const body = `<form id="registration-form" data-event-id="${event.id}">
      <label>Purchaser email<input name="purchaser_email" type="email" value="${escapeHtml(getSessionEmail() || "")}" required></label>
      <div id="participant-fields">${participantFields(event, 0)}</div>
      <button class="subtle-button" data-add-participant-field type="button">+ Add another participant</button>
      <label>Promo code <span class="optional-label">Optional</span><input name="promo_code" autocomplete="off"></label>
      <label class="check-label"><input name="join_waitlist" type="checkbox" checked> Join the waitlist automatically if this option sells out.</label>
      <h3>Team</h3><label>Team option<select name="team_mode"><option value="">No team</option><option value="join">Join an existing team</option><option value="create">Create a team</option></select></label>
      <div class="team-fields"><label>Existing team<select name="team_id"><option value="">Choose a team</option>${teams}</select></label><label>Team name<input name="team_name"></label><div class="split-fields"><label>Category<select name="team_category"><option>club</option><option>corporate</option><option>family</option><option>relay</option></select></label><label>Access code<input name="team_code" autocomplete="off"></label></div></div>
      ${productSection}${donationSection}<button class="primary-button" type="submit">Continue to group checkout</button>
    </form>`;
    return modalShell({ eyebrow: "Group registration", title: "Register your crew", body, wide: true }, escapeHtml);
  }

  function manual(event) {
    const body = `<form id="manual-registration-form" data-event-id="${event.id}"><label>Registration option<select name="tier_id" required>${renderList(event.os_event_tiers, (tier) => `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`)}</select></label><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Email<input name="email" type="email" required></label><label>Emergency contact<input name="emergency_contact" required></label><label>Bib number<input name="bib_number"></label><label>Organizer notes<textarea name="organizer_notes" rows="3"></textarea></label><button class="primary-button" type="submit">Add confirmed entry</button></form>`;
    return modalShell({ eyebrow: "Organizer entry", title: "Add participant", body }, escapeHtml);
  }

  function answers(item, title) {
    return item.os_registration_answers?.length ? `<div class="answer-list"><strong>${title}</strong>${renderList(item.os_registration_answers, (answer) => `<p><b>${escapeHtml(answer.os_event_questions?.label || "Question")}</b><span>${escapeHtml(answer.answer)}</span></p>`)}</div>` : "";
  }

  function edit(item) {
    const statuses = renderList(["confirmed", "pending", "cancel_requested", "cancelled", "expired"], (status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`);
    const body = `<form id="edit-registration-form" data-registration-id="${item.id}"><div class="split-fields"><label>First name<input name="first_name" value="${escapeHtml(item.first_name)}" required></label><label>Last name<input name="last_name" value="${escapeHtml(item.last_name)}" required></label></div><label>Email<input name="email" type="email" value="${escapeHtml(item.email)}" required></label><label>Emergency contact<input name="emergency_contact" value="${escapeHtml(item.emergency_contact)}" required></label><div class="split-fields"><label>Bib number<input name="bib_number" value="${escapeHtml(item.bib_number || "")}"></label><label>Status<select name="status">${statuses}</select></label></div><label>Organizer notes<textarea name="organizer_notes" rows="3">${escapeHtml(item.organizer_notes || "")}</textarea></label>${answers(item, "Registration answers")}<div class="dialog-actions"><button class="primary-button" type="submit">Save changes</button><button class="subtle-button" data-resend-confirmation="${item.id}" type="button">Resend confirmation</button>${item.payment_status === "paid" ? `<button class="danger-button" data-organizer-refund="${item.id}" type="button">Refund & cancel</button>` : `<button class="danger-button" data-organizer-cancel="${item.id}" type="button">Cancel entry</button>`}</div></form>`;
    return modalShell({ eyebrow: "Registration", title: `${item.first_name} ${item.last_name}`, body }, escapeHtml);
  }

  function runner(item) {
    const activity = [...(item.os_registration_activity || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const location = getLocation();
    const actions = `${item.status === "confirmed" ? `<button class="primary-button" data-view-pass="${item.id}" type="button">View QR pass</button>` : ""}${item.status === "confirmed" && item.os_events?.os_waves?.some((wave) => wave.tier_id === item.tier_id && wave.self_select) ? `<button class="subtle-button" data-runner-wave="${item.id}" type="button">Choose start wave</button>` : ""}${item.status === "confirmed" && item.os_events?.allow_transfers ? `<button class="subtle-button" data-create-transfer="${item.id}" type="button">Create transfer link</button>` : ""}${item.status === "confirmed" && item.os_events?.allow_refund_requests ? `<button class="danger-button" data-request-cancel="${item.id}" type="button">Request cancellation</button>` : ""}`;
    const body = `<form id="runner-registration-form" data-registration-id="${item.id}"><div class="split-fields"><label>First name<input name="first_name" value="${escapeHtml(item.first_name)}" required></label><label>Last name<input name="last_name" value="${escapeHtml(item.last_name)}" required></label></div><label>Email<input value="${escapeHtml(item.email)}" disabled></label><label>Emergency contact<input name="emergency_contact" value="${escapeHtml(item.emergency_contact)}" required></label><div class="registration-facts"><span><b>Status</b>${escapeHtml(item.status)}</span><span><b>Payment</b>${escapeHtml(item.payment_status)}</span><span><b>Bib</b>${escapeHtml(item.bib_number || "Not assigned")}</span><span><b>Wave</b>${escapeHtml(item.os_waves?.name || "Not assigned")}</span></div>${answers(item, "Your answers")}<button class="primary-button" type="submit">Save participant details</button></form>
      <div class="self-service-actions">${actions}</div>
      ${item.transfer_token ? `<div class="transfer-link"><b>Active transfer link</b><input readonly value="${location.origin}${location.pathname}?transfer=${item.transfer_token}"><small>Expires ${displayDate(item.transfer_expires_at)}</small></div>` : ""}
      <div class="activity-list"><h3>Activity</h3>${renderList(activity, (entry) => `<p><span>${escapeHtml(entry.action.replaceAll("_", " "))}</span><small>${new Date(entry.created_at).toLocaleString()}</small></p>`) || "<p>No changes recorded yet.</p>"}</div>`;
    return modalShell({ eyebrow: "My registration", title: item.os_events?.name || "Race", body }, escapeHtml);
  }

  function transfer(token) {
    const body = `<form id="accept-transfer-form" data-token="${escapeHtml(token)}"><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Emergency contact<input name="emergency_contact" required></label><label class="check-label"><input type="checkbox" required> I accept the event waiver and this transferred registration.</label><button class="primary-button" type="submit">Accept transfer</button></form>`;
    return modalShell({ eyebrow: "Registration transfer", title: "Accept this entry", body }, escapeHtml);
  }

  return { participantFields, registration, manual, edit, runner, transfer };
}
