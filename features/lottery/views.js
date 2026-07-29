import { displayDate, escapeHtml, money } from "../../core.js?v=36";
import { modalShell, renderList } from "../../modules/render.js?v=62";

export function createLotteryViews({ effectivePrice, safeUrl, tierById }) {
  function runnerCard(application) {
    const invitationOpen = application.status === "selected"
      && ["offered", "checkout"].includes(application.invitation_status)
      && new Date(application.invitation_expires_at) > new Date();
    const tickets = application.base_tickets + application.bonus_tickets;
    return `<article><h3>${escapeHtml(application.os_events?.name || "Race lottery")} <small>${escapeHtml(application.os_event_tiers?.name || "")}</small></h3>
      <p><span>${displayDate(application.os_events?.starts_at)} · ${tickets} ticket${tickets === 1 ? "" : "s"}</span><b class="lottery-status ${application.status}">${escapeHtml(application.status)}</b></p>
      ${application.status === "waitlisted" && application.waitlist_position ? `<p><span>Waitlist position</span><b>#${application.waitlist_position}</b></p>` : ""}
      ${application.invitation_status === "accepted" ? `<p><span>Invitation</span><b>Registration completed</b></p>` : ""}
      ${invitationOpen ? `<div class="lottery-offer"><b>Your place is ready.</b><span>Complete registration by ${new Date(application.invitation_expires_at).toLocaleString()}.</span><button class="primary-button" data-claim-lottery="${application.id}" type="button">${application.invitation_status === "checkout" ? "Return to payment" : "Complete registration"}</button></div>` : ""}
      ${application.review_notes ? `<p><span>Organizer note</span><b>${escapeHtml(application.review_notes)}</b></p>` : ""}
      ${["submitted", "qualified", "disqualified"].includes(application.status) ? `<button class="subtle-button" data-withdraw-lottery="${application.id}" type="button">Withdraw application</button>` : ""}
    </article>`;
  }

  function application(event) {
    const tiers = renderList(event.os_event_tiers, (tier) => `<option value="${tier.id}">${escapeHtml(tier.name)} · ${money(effectivePrice(tier))} if selected</option>`);
    const qualifier = event.qualifier_required ? `<div class="qualifier-fields"><h3>Qualifying result</h3><p>${escapeHtml(event.qualifier_instructions || "Provide a recent result that meets this event’s requirements.")}</p><label>Qualifying race<input name="qualifier_name" required></label><div class="split-fields"><label>Race date<input name="qualifier_date" type="date" required></label><label>Result or finish time<input name="qualifier_result" placeholder="12:34:56 or finisher" required></label></div><label>Public result URL<input name="qualifier_url" type="url" placeholder="https://…"></label><label>Notes<textarea name="qualifier_notes" rows="3"></textarea></label></div>` : "";
    const body = `<p class="modal-note">Applying does not charge your card or guarantee entry. Selection and payment happen after the application period closes.</p>
      <form id="lottery-application-form" data-event-id="${event.id}">
        <label>Race option<select name="tier_id" required>${tiers}</select></label>
        <div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div>
        ${qualifier}
        <label class="check-label"><input type="checkbox" required> I certify that this application and any qualifying result are accurate.</label>
        <button class="primary-button" type="submit">Submit application</button>
      </form>`;
    return modalShell({ eyebrow: "Race lottery", title: `Apply to ${event.name}`, body }, escapeHtml);
  }

  function checkout(applicationRecord) {
    const race = applicationRecord.os_events;
    const questions = [...(race?.os_event_questions || [])].sort((a, b) => a.sort_order - b.sort_order);
    const questionFields = renderList(questions, (question) => {
      if (question.field_type === "select") return `<label>${escapeHtml(question.label)}<select data-question-id="${question.id}" ${question.required ? "required" : ""}><option value="">Choose one</option>${renderList(question.options || [], (option) => `<option>${escapeHtml(option)}</option>`)}</select></label>`;
      if (question.field_type === "checkbox") return `<label class="check-label"><input data-question-id="${question.id}" type="checkbox" ${question.required ? "required" : ""}> ${escapeHtml(question.label)}</label>`;
      return `<label>${escapeHtml(question.label)}<input data-question-id="${question.id}" ${question.required ? "required" : ""}></label>`;
    });
    const waiver = race?.waiver_text ? `<div class="waiver-box"><strong>Participant waiver</strong><p>${escapeHtml(race.waiver_text)}</p></div><label class="check-label"><input name="waiver" type="checkbox" required> I accept the participant waiver.</label>` : "";
    const body = `<p class="modal-note">Complete before ${new Date(applicationRecord.invitation_expires_at).toLocaleString()}. Your invitation is tied to this account and cannot be transferred.</p>
      <form id="lottery-checkout-form" data-application-id="${applicationRecord.id}">
        <div class="registration-facts"><span><b>Event</b>${escapeHtml(race?.name || "")}</span><span><b>Entry</b>${escapeHtml(applicationRecord.os_event_tiers?.name || "")}</span><span><b>Price</b>${money(applicationRecord.os_event_tiers?.price_cents || 0)}</span></div>
        <label>Emergency contact<input name="emergency_contact" placeholder="Name · phone" required></label>
        ${questionFields}${waiver}
        <button class="primary-button" type="submit">Continue to secure payment</button>
      </form>`;
    return modalShell({ eyebrow: "Selected runner registration", title: "Claim your place", body }, escapeHtml);
  }

  function lifecycle(event) {
    const applications = [...(event.os_lottery_applications || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const draw = event.os_lottery_draws?.[0];
    const entries = new Map((draw?.os_lottery_draw_entries || []).map((entry) => [entry.application_id, entry]));
    const closed = event.lottery_closes_at && new Date(event.lottery_closes_at) <= new Date();
    const qualified = applications.filter((item) => item.status === "qualified").length;
    const toLocal = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    const reviews = renderList(applications, (item) => {
      const evidence = item.qualifier_name
        ? `<b>${escapeHtml(item.qualifier_name)}</b><small>${item.qualifier_date ? displayDate(item.qualifier_date) : ""} · ${escapeHtml(item.qualifier_result || "")}</small>${item.qualifier_url ? `<a href="${escapeHtml(safeUrl(item.qualifier_url) || "#")}" target="_blank" rel="noopener">Verify result ↗</a>` : ""}`
        : "<small>No qualifier supplied</small>";
      const outcome = draw
        ? `<div class="lottery-final-result"><b>#${entries.get(item.id)?.draw_rank || "—"} · ${escapeHtml(item.status)}</b><small>${item.base_tickets + item.bonus_tickets} tickets · ${escapeHtml(item.invitation_status)}${item.invitation_expires_at ? ` · deadline ${new Date(item.invitation_expires_at).toLocaleString()}` : ""}</small></div>`
        : `<div class="lottery-review-controls"><select name="status">${renderList(["submitted", "qualified", "disqualified"], (status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`)}</select><label>Bonus tickets<input name="bonus_tickets" type="number" min="0" value="${item.bonus_tickets}"></label><input name="review_notes" value="${escapeHtml(item.review_notes || "")}" placeholder="Private/applicant note"><button class="subtle-button" type="submit">Save review</button></div>`;
      return `<form class="lottery-review-form" data-application-id="${item.id}" data-event-id="${event.id}"><div><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)} · ${escapeHtml(tierById(event, item.tier_id)?.name || "")}</small></div><div class="qualifier-evidence">${evidence}</div>${outcome}</form>`;
    }) || '<div class="empty-state">No lottery applications yet.</div>';
    const drawPanel = draw
      ? `<div><p class="eyebrow">FINALIZED DRAW</p><h3>${draw.selected_count} selected · ${draw.eligible_count - draw.selected_count} waitlisted</h3><p>Algorithm ${escapeHtml(draw.algorithm_version)} · Drawn ${new Date(draw.created_at).toLocaleString()}</p><details><summary>Audit details</summary><code>Seed: ${escapeHtml(draw.seed)}</code><code>SHA-256: ${escapeHtml(draw.seed_hash)}</code></details></div>`
      : `<div><p class="eyebrow">${closed ? "READY FOR DRAW" : "APPLICATIONS OPEN"}</p><h3>${closed ? `${qualified} qualified runners for ${event.lottery_spots || 0} spots` : `Draw unlocks after ${event.lottery_closes_at ? new Date(event.lottery_closes_at).toLocaleString() : "the closing date"}`}</h3><p>The result is permanent. Weighted tickets influence probability, while every rank and score is recorded for audit.</p></div>${closed && qualified ? `<button class="primary-button" data-run-lottery="${event.id}" type="button">Run final draw</button>` : ""}`;
    const body = `<form id="lottery-settings-form" data-event-id="${event.id}">
        <div class="split-fields"><label>Registration mode<select name="registration_mode"><option value="open" ${event.registration_mode !== "lottery" && event.registration_mode !== "closed" ? "selected" : ""}>Open registration</option><option value="lottery" ${event.registration_mode === "lottery" ? "selected" : ""}>Lottery</option><option value="closed" ${event.registration_mode === "closed" ? "selected" : ""}>Closed</option></select></label><label>Available lottery spots<input name="lottery_spots" type="number" min="1" value="${event.lottery_spots || ""}"></label></div>
        <div class="split-fields"><label>Applications open<input name="lottery_opens_at" type="datetime-local" value="${toLocal(event.lottery_opens_at)}"></label><label>Applications close<input name="lottery_closes_at" type="datetime-local" value="${toLocal(event.lottery_closes_at)}"></label></div>
        <label>Selected-runner payment window <span class="optional-label">Hours</span><input name="lottery_invitation_hours" type="number" min="1" max="168" value="${event.lottery_invitation_hours || 48}" required></label>
        <label class="check-label"><input name="qualifier_required" type="checkbox" ${event.qualifier_required ? "checked" : ""}> Require a qualifying result</label>
        <label>Qualifier instructions<textarea name="qualifier_instructions" rows="3" placeholder="Eligible distances, date range, and cutoff time">${escapeHtml(event.qualifier_instructions || "")}</textarea></label>
        <button class="primary-button" type="submit" ${draw ? "disabled" : ""}>${draw ? "Settings locked after draw" : "Save lottery settings"}</button>
      </form>
      <div class="lottery-summary"><span><b>${applications.length}</b> applications</span><span><b>${qualified}</b> qualified</span><span><b>${applications.reduce((sum, item) => sum + item.base_tickets + item.bonus_tickets, 0)}</b> total tickets</span></div>
      <div class="lottery-draw-panel">${drawPanel}</div>
      <h3>${draw ? "Final results and invitations" : "Qualifier review"}</h3><div class="lottery-review-list">${reviews}</div>`;
    return modalShell({ eyebrow: "Applications, draw, and invitations", title: `${event.name} lottery`, body, wide: true }, escapeHtml);
  }

  return { runnerCard, application, checkout, lifecycle };
}
