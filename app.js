import {
  configured, displayDate, escapeHtml, eventDay, eventMonth, money, slugify, supabase,
} from "./core.js?v=15";
import {
  beginRegistration, beginStripeOnboarding, createEvent, createEventQuestion,
  createManualRegistration, createProduct, createPromoCode, createScheduledPrice,
  deleteEventQuestion, deleteScheduledPrice, DEMO_ORGANIZER_ID,
  getOrganizerProfile, listCaptainTeams, listOrganizerEvents, listOrganizerOrderItems, listPublishedEvents, listRegistrations,
  listRunnerRegistrations, raceDayAction, registrationAction, resendConfirmation, resetDemo, updateEventSettings,
  updateOrderItem, updateRegistration, updateWaitlist,
} from "./data.js?v=15";

const page = document.querySelector("#page-content");
const dialog = document.querySelector("#app-dialog");
const dialogContent = document.querySelector("#dialog-content");
const notice = document.querySelector("#notice");
const authButton = document.querySelector("#auth-button");
const signOutButton = document.querySelector("#sign-out");
const setupBanner = document.querySelector("#setup-banner");

const state = {
  view: "discover",
  events: [],
  registrations: [],
  selectedEvent: null,
  session: null,
  profile: null,
  runnerRegistrations: [],
  captainTeams: [],
  orderItems: [],
  pendingView: "dashboard",
  pendingTransfer: null,
};

const eventById = (id) => state.events.find((event) => event.id === id);
const tierById = (event, id) => event?.os_event_tiers?.find((tier) => tier.id === id);
const eventRegistrations = (id) => state.registrations.filter((registration) => registration.event_id === id);
const effectivePrice = (tier) => {
  const now = Date.now();
  const active = (tier.os_tier_prices || []).filter((price) => new Date(price.starts_at).getTime() <= now)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return active[0]?.price_cents ?? tier.price_cents;
};
const localDateTime = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

function showNotice(message) {
  notice.querySelector("span").textContent = message;
  notice.classList.remove("hidden");
}

function syncNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("nav-active", button.dataset.view === state.view);
  });
  authButton.classList.toggle("hidden", Boolean(state.session));
  signOutButton.classList.toggle("hidden", !state.session);
}

function publicEventCard(event, index) {
  const tiers = event.os_event_tiers || [];
  return `
    <article class="event-card event-tone-${index % 3}">
      <div class="event-date"><span>${eventMonth(event.starts_at)}</span><strong>${eventDay(event.starts_at)}</strong></div>
      <div class="event-card-content">
        <p>${escapeHtml(event.location_name)}</p>
        <h3>${escapeHtml(event.name)}</h3>
        <div class="tier-pills">${tiers.map((tier) => `<span>${escapeHtml(tier.distance_label)}</span>`).join("")}</div>
        <button data-event-id="${event.id}" type="button">View event <span>→</span></button>
      </div>
    </article>`;
}

function renderDiscover() {
  const published = state.events.filter((event) => event.status === "published");
  page.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Registration without the runaround</p>
        <h1>Great race days start in the open.</h1>
        <p class="hero-lede">Discover local events and register in minutes. OpenStart gives organizers a transparent, community-owned alternative for managing every starting line.</p>
        <div class="hero-actions"><a class="primary-button" href="#events">Explore events</a><button class="text-button" data-go-dashboard type="button">I organize races →</button></div>
      </div>
      <div class="hero-card">
        <div class="route-line"><span>START</span><i></i><span>FINISH</span></div>
        <p>Up next</p><strong>${escapeHtml(published[0]?.name || "Your next race")}</strong>
        <div class="hero-meta"><span><b>${published.length}</b> events</span><span><b>${published.reduce((sum, event) => sum + event.os_event_tiers.length, 0)}</b> distances</span><span><b>${money(Math.min(...published.flatMap((event) => event.os_event_tiers.map(effectivePrice))))}</b> from</span></div>
      </div>
    </section>
    <section class="events-section" id="events">
      <div class="section-heading"><div><p class="eyebrow">On the calendar</p><h2>Find your next starting line</h2></div><span>${published.length} open events</span></div>
      <div class="event-grid">${published.map(publicEventCard).join("")}</div>
    </section>
    <section class="open-promise">
      <div><p class="eyebrow">Built differently</p><h2>Your event platform should work for your community.</h2></div>
      <div class="promise-grid">
        <div><b>01</b><h3>Transparent by default</h3><p>Open code, understandable costs, and participant data that stays yours.</p></div>
        <div><b>02</b><h3>Ready for race day</h3><p>Registration, rosters, capacity, and exports in one focused workspace.</p></div>
        <div><b>03</b><h3>Made to extend</h3><p>Build the workflow your event needs without waiting on a closed platform.</p></div>
      </div>
    </section>`;
}

function renderEvent(event) {
  const registrations = eventRegistrations(event.id);
  page.innerHTML = `
    <section class="event-detail">
      <button class="back-button" data-back type="button">← All events</button>
      <div class="detail-hero">
        <div><p class="eyebrow">${displayDate(event.starts_at)} · ${escapeHtml(event.location_name)}</p><h1>${escapeHtml(event.name)}</h1><p>${escapeHtml(event.description)}</p></div>
        <div class="start-badge"><span>OPEN</span><strong>START</strong></div>
      </div>
      <div class="detail-layout">
        <div>
          <h2>Choose your event</h2>
          <div class="tier-list">
            ${event.os_event_tiers.map((tier) => {
              const used = registrations.filter((item) => item.tier_id === tier.id).length;
              return `<div class="tier-row"><div><h3>${escapeHtml(tier.name)}</h3><p>${escapeHtml(tier.distance_label)} · capacity ${tier.capacity}${used ? ` · ${used} registered` : ""}</p></div><strong>${money(effectivePrice(tier))}</strong></div>`;
            }).join("")}
          </div>
          <div class="detail-note"><b>Simple for now, extensible later.</b><p>Registration is connected. Paid entries remain pending until a payment provider confirms them server-side.</p></div>
        </div>
        <aside class="registration-panel">
          <p>Registration is open</p><h2>Claim your spot</h2>
          <span>Your entry is saved immediately. Paid registrations are marked pending while payments are disabled.</span>
          <button class="primary-button" data-register="${event.id}" type="button">Register now</button>
        </aside>
      </div>
    </section>`;
}

function renderDashboard() {
  const published = state.events.filter((event) => event.status === "published");
  const confirmed = state.registrations.filter((registration) => registration.status === "confirmed");
  const gross = confirmed.reduce((sum, registration) => sum + registration.amount_cents, 0);
  const discounts = confirmed.reduce((sum, registration) => sum + (registration.discount_cents || 0), 0);
  const platformFees = confirmed.reduce((sum, registration) => {
    const race = eventById(registration.event_id);
    return sum + Math.round(registration.amount_cents * (race?.platform_fee_bps || 500) / 10000);
  }, 0);
  const paidItems = state.orderItems.filter((item) => ["paid","partially_refunded"].includes(item.os_orders?.status));
  const merchandiseRevenue = paidItems.filter((item) => item.item_type === "product").reduce((sum,item) => sum + item.amount_cents, 0);
  const donationRevenue = paidItems.filter((item) => item.item_type === "donation").reduce((sum,item) => sum + item.amount_cents, 0);
  const stripeReady = state.profile?.stripe_charges_enabled && state.profile?.stripe_payouts_enabled;
  const stripeStarted = Boolean(state.profile?.stripe_account_id);
  page.innerHTML = `
    <section class="dashboard">
      <div class="dashboard-header">
        <div><p class="eyebrow">Organizer workspace</p><h1>Good morning, race director.</h1><p>Here’s what’s happening across your starting lines.</p></div>
        <div class="dashboard-actions">
          ${configured ? `<button class="stripe-button ${stripeReady ? "ready" : ""}" data-connect-stripe type="button">${stripeReady ? "✓ Stripe ready" : stripeStarted ? "Finish Stripe setup" : "Connect Stripe sandbox"}</button>` : ""}
          <button class="primary-button" data-create-event type="button">+ Create event</button>
        </div>
      </div>
      <div class="metric-grid">
        <div><p>Confirmed registrations</p><strong>${confirmed.length}</strong><span>Across all events</span></div>
        <div><p>Published events</p><strong>${published.length}</strong><span>${state.events.length - published.length} draft</span></div>
        <div><p>Confirmed registration value</p><strong>${money(gross)}</strong><span>Paid and free confirmed entries</span></div>
        <div><p>Estimated organizer net</p><strong>${money(gross - platformFees)}</strong><span>${money(discounts)} discounts · before Stripe fees</span></div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Your events</h2><p>Manage details and monitor signups.</p></div>${configured ? "" : '<button class="subtle-button" data-reset-demo type="button">Reset demo</button>'}</div>
        <div class="event-table">
          <div class="table-header"><span>Event</span><span>Status</span><span>Registrations</span><span>Date</span></div>
          ${state.events.map((event) => `
            <button class="table-row" data-roster="${event.id}" type="button">
              <span><b>${escapeHtml(event.name)}</b><small>${escapeHtml(event.location_name)}</small></span>
              <span><i class="status-dot ${event.status}"></i>${event.status}</span>
              <span>${eventRegistrations(event.id).filter((registration) => registration.status === "confirmed").length}</span>
              <span>${displayDate(event.starts_at)} <b>›</b></span>
            </button>`).join("")}
        </div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Financial overview</h2><p>Confirmed registration revenue and OpenStart application fees.</p></div><button class="subtle-button" data-export-finance type="button">Export financial CSV</button></div>
        <div class="revenue-categories"><span><b>${money(gross)}</b>Registrations</span><span><b>${money(merchandiseRevenue)}</b>Merchandise</span><span><b>${money(donationRevenue)}</b>Donations</span></div>
        <div class="finance-grid">${state.events.map((event) => {
          const entries = eventRegistrations(event.id).filter((item) => item.status === "confirmed");
          const revenue = entries.reduce((sum, item) => sum + item.amount_cents, 0);
          const fees = entries.reduce((sum, item) => sum + Math.round(item.amount_cents * (event.platform_fee_bps || 500) / 10000), 0);
          return `<div><span>${escapeHtml(event.name)}</span><b>${money(revenue)}</b><small>${entries.length} entries · ${money(revenue - fees)} estimated net</small></div>`;
        }).join("")}</div>
      </div>
      <div id="roster-slot"></div>
    </section>`;
}

function renderRunnerDashboard() {
  const confirmed = state.runnerRegistrations.filter((registration) => registration.status === "confirmed");
  page.innerHTML = `
    <section class="dashboard">
      <div class="dashboard-header">
        <div><p class="eyebrow">Runner account</p><h1>My races</h1><p>Entries connected to ${escapeHtml(state.session?.user?.email || "your account")}.</p></div>
      </div>
      <div class="metric-grid">
        <div><p>Confirmed races</p><strong>${confirmed.length}</strong><span>Your paid and free entries</span></div>
        <div><p>All attempts</p><strong>${state.runnerRegistrations.length}</strong><span>Includes cancelled checkouts</span></div>
        <div><p>Confirmed value</p><strong>${money(confirmed.reduce((sum, item) => sum + item.amount_cents, 0))}</strong><span>Registration total</span></div>
      </div>
      <div class="runner-list">
        ${state.runnerRegistrations.length ? state.runnerRegistrations.map((item) => `
          <article class="runner-entry">
            <div>
              <p>${escapeHtml(item.os_events?.location_name || "")} · ${displayDate(item.os_events?.starts_at)}</p>
              <h2>${escapeHtml(item.os_events?.name || "Race registration")}</h2>
              <small>${escapeHtml(item.os_event_tiers?.name || "Entry")} · ${escapeHtml(item.os_event_tiers?.distance_label || "")}${item.os_teams?.name ? ` · Team ${escapeHtml(item.os_teams.name)}` : ""}</small>
            </div>
            <div class="runner-entry-meta"><strong>${escapeHtml(item.status)}</strong><span>${money(item.amount_cents)}</span><button class="subtle-button" data-manage-runner="${item.id}" type="button">Manage</button></div>
          </article>`).join("") : '<div class="empty-state">No registrations are linked to this email yet.</div>'}
      </div>
      ${state.captainTeams.length ? `<div class="captain-dashboard"><div class="card-heading"><div><h2>Teams I captain</h2><p>Member status and relay assignments.</p></div></div>${state.captainTeams.map((team) => `<article><h3>${escapeHtml(team.name)} <small>${escapeHtml(team.category)} · ${escapeHtml(team.os_events?.name || "")}</small></h3>${(team.os_registrations || []).map((member) => `<p><span>${escapeHtml(member.first_name)} ${escapeHtml(member.last_name)}${member.relay_leg ? ` · ${escapeHtml(member.relay_leg)}` : ""}</span><b>${escapeHtml(member.status)}</b></p>`).join("")}</article>`).join("")}</div>` : ""}
    </section>`;
}

function renderRoster(event) {
  const registrations = eventRegistrations(event.id);
  document.querySelector("#roster-slot").innerHTML = `
    <div class="dashboard-card roster-card">
      <div class="card-heading"><div><h2>${escapeHtml(event.name)} registrations</h2><p>Manage participants, race-day details, questions, and waiver.</p></div><button class="subtle-button" data-close-roster type="button">Close</button></div>
      <div class="roster-toolbar">
        <input data-roster-search="${event.id}" type="search" placeholder="Search name, email, or bib">
        <select data-roster-status="${event.id}"><option value="">All statuses</option><option>confirmed</option><option>pending</option><option>reserved</option><option>cancelled</option><option>expired</option></select>
        <button class="subtle-button" data-add-participant="${event.id}" type="button">+ Manual entry</button>
        <button class="subtle-button" data-export-roster="${event.id}" type="button">Export CSV</button>
        <button class="subtle-button" data-race-day="${event.id}" type="button">Race day</button>
        <button class="subtle-button" data-product-settings="${event.id}" type="button">Products</button>
        <button class="subtle-button" data-pricing-settings="${event.id}" type="button">Pricing</button>
        <button class="subtle-button" data-registration-settings="${event.id}" type="button">Form settings</button>
      </div>
      ${registrations.length ? `<div class="roster roster-manage">${registrations.map((item) => `
        <button data-edit-registration="${item.id}" data-search="${escapeHtml(`${item.first_name} ${item.last_name} ${item.email} ${item.bib_number || ""}`.toLowerCase())}" data-status="${item.status}" type="button"><span class="avatar">${escapeHtml(item.first_name[0])}${escapeHtml(item.last_name[0])}</span>
        <span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)}</small></span>
        <span>${escapeHtml(tierById(event, item.tier_id)?.name || "Entry")}<small>${item.bib_number ? `Bib ${escapeHtml(item.bib_number)}` : "No bib assigned"}</small></span><span>${item.status}</span></button>`).join("")}</div>`
        : '<div class="empty-state">No registrations yet. Share the published event to get the first runner on the list.</div>'}
      <div class="form-summary"><strong>${event.os_event_questions?.length || 0} custom questions</strong><span>${event.waiver_text ? "Waiver enabled" : "No waiver configured"}</span></div>
      ${(event.os_waitlist || []).length ? `<div class="waitlist-list"><h3>Waitlist</h3>${event.os_waitlist.map((item) => `<div><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)} · ${escapeHtml(tierById(event, item.tier_id)?.name || "")}</small></span><select data-waitlist-id="${item.id}"><option ${item.status === "waiting" ? "selected" : ""}>waiting</option><option ${item.status === "invited" ? "selected" : ""}>invited</option><option ${item.status === "registered" ? "selected" : ""}>registered</option><option ${item.status === "removed" ? "selected" : ""}>removed</option></select></div>`).join("")}</div>` : ""}
      ${(event.os_teams || []).length ? `<div class="team-list"><h3>Teams</h3>${event.os_teams.map((team) => { const members = registrations.filter((item) => item.team_id === team.id && item.status !== "cancelled"); return `<div><span><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.category)} · ${members.length}${team.max_members ? ` / ${team.max_members}` : ""} members</small></span><span>${members.map((member) => escapeHtml(`${member.first_name} ${member.last_name}`)).join(", ") || "No members"}</span></div>`; }).join("")}</div>` : ""}
    </div>`;
  document.querySelector("#roster-slot").scrollIntoView({ behavior: "smooth" });
}

function authForm() {
  return `
    <section class="modal auth-modal">
      <div class="form-heading"><div><p>OpenStart account</p><h2>Sign in to OpenStart</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
      <form id="auth-form">
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
        <button class="primary-button" name="intent" value="signin" type="submit">Sign in</button>
        <button class="subtle-button" name="intent" value="signup" type="submit">Create account</button>
        <p class="form-message" aria-live="polite"></p>
      </form>
    </section>`;
}

function participantFields(event, index) {
  const questions = [...(event.os_event_questions || [])].sort((a, b) => a.sort_order - b.sort_order);
  return `<fieldset class="participant-block" data-participant-index="${index}"><legend>Participant ${index + 1}</legend>
        <label>Event<select data-field="tier_id" required>${event.os_event_tiers.map((tier) => `<option value="${tier.id}">${escapeHtml(tier.name)} · ${money(effectivePrice(tier))}</option>`).join("")}</select></label>
        <div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div>
        <label>Email<input name="email" type="email" required></label>
        ${questions.map((question) => question.field_type === "select"
          ? `<label>${escapeHtml(question.label)}<select data-question-id="${question.id}" ${question.required ? "required" : ""}><option value="">Choose one</option>${(question.options || []).map((option) => `<option>${escapeHtml(option)}</option>`).join("")}</select></label>`
          : question.field_type === "checkbox"
            ? `<label class="check-label"><input data-question-id="${question.id}" type="checkbox" value="Yes" ${question.required ? "required" : ""}> ${escapeHtml(question.label)}</label>`
            : `<label>${escapeHtml(question.label)}<input data-question-id="${question.id}" ${question.required ? "required" : ""}></label>`).join("")}
        <label>Emergency contact<input name="emergency_contact" placeholder="Name · phone" required></label>
        <label>Relay leg <span class="optional-label">Optional</span><input name="relay_leg" placeholder="Leg 1"></label>
        ${event.waiver_text ? `<div class="waiver-box"><strong>Participant waiver</strong><p>${escapeHtml(event.waiver_text)}</p></div><label class="check-label"><input name="waiver" type="checkbox" required> This participant accepts the waiver.</label>` : ""}
        ${index ? '<button class="remove-participant" data-remove-participant type="button">Remove participant</button>' : ""}
      </fieldset>`;
}

function registrationForm(event) {
  const teams = event.os_teams || [];
  return `
    <section class="modal wide-modal">
      <div class="form-heading"><div><p>Group registration</p><h2>Register your crew</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
      <form id="registration-form" data-event-id="${event.id}">
        <label>Purchaser email<input name="purchaser_email" type="email" value="${escapeHtml(state.session?.user?.email || "")}" required></label>
        <div id="participant-fields">${participantFields(event, 0)}</div>
        <button class="subtle-button" data-add-participant-field type="button">+ Add another participant</button>
        <label>Promo code <span class="optional-label">Optional</span><input name="promo_code" autocomplete="off"></label>
        <label class="check-label"><input name="join_waitlist" type="checkbox" checked> Join the waitlist automatically if this option sells out.</label>
        <h3>Team</h3>
        <label>Team option<select name="team_mode"><option value="">No team</option><option value="join">Join an existing team</option><option value="create">Create a team</option></select></label>
        <div class="team-fields">
          <label>Existing team<select name="team_id"><option value="">Choose a team</option>${teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)} · ${escapeHtml(team.category)}</option>`).join("")}</select></label>
          <label>Team name<input name="team_name"></label>
          <div class="split-fields"><label>Category<select name="team_category"><option>club</option><option>corporate</option><option>family</option><option>relay</option></select></label><label>Access code<input name="team_code" autocomplete="off"></label></div>
        </div>
        ${(event.os_products || []).length ? `<h3>Add-ons</h3><div class="product-options">${event.os_products.filter((product) => product.active).map((product) => `<div><span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.description)}</small></span><select data-product-variant><option value="">No thanks</option>${product.os_product_variants.map((variant) => `<option value="${variant.id}">${escapeHtml(variant.name)} · ${money(variant.price_cents)}${variant.inventory !== null ? ` · ${variant.inventory} total` : ""}</option>`).join("")}</select><input data-product-quantity type="number" min="1" max="10" value="1" aria-label="${escapeHtml(product.name)} quantity"></div>`).join("")}</div>` : ""}
        ${event.donations_enabled ? `<h3>Support ${escapeHtml(event.beneficiary_name || event.name)}</h3><div class="donation-fields"><label>Donation amount<input name="donation_amount" type="number" min="0" step=".01" placeholder="0.00"></label><label>Dedication or message<input name="dedication" maxlength="300"></label><label class="check-label"><input name="anonymous_donation" type="checkbox"> Make this donation anonymous</label></div>` : ""}
        <button class="primary-button" type="submit">Continue to group checkout</button>
      </form>
    </section>`;
}

function manualRegistrationForm(event) {
  return `<section class="modal"><div class="form-heading"><div><p>Organizer entry</p><h2>Add participant</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="manual-registration-form" data-event-id="${event.id}">
      <label>Registration option<select name="tier_id" required>${event.os_event_tiers.map((tier) => `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`).join("")}</select></label>
      <div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div>
      <label>Email<input name="email" type="email" required></label><label>Emergency contact<input name="emergency_contact" required></label>
      <label>Bib number<input name="bib_number"></label><label>Organizer notes<textarea name="organizer_notes" rows="3"></textarea></label>
      <button class="primary-button" type="submit">Add confirmed entry</button>
    </form></section>`;
}

function editRegistrationForm(item) {
  return `<section class="modal"><div class="form-heading"><div><p>Registration</p><h2>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="edit-registration-form" data-registration-id="${item.id}">
      <div class="split-fields"><label>First name<input name="first_name" value="${escapeHtml(item.first_name)}" required></label><label>Last name<input name="last_name" value="${escapeHtml(item.last_name)}" required></label></div>
      <label>Email<input name="email" type="email" value="${escapeHtml(item.email)}" required></label><label>Emergency contact<input name="emergency_contact" value="${escapeHtml(item.emergency_contact)}" required></label>
      <div class="split-fields"><label>Bib number<input name="bib_number" value="${escapeHtml(item.bib_number || "")}"></label><label>Status<select name="status">${["confirmed", "pending", "cancel_requested", "cancelled", "expired"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></div>
      <label>Organizer notes<textarea name="organizer_notes" rows="3">${escapeHtml(item.organizer_notes || "")}</textarea></label>
      ${item.os_registration_answers?.length ? `<div class="answer-list"><strong>Registration answers</strong>${item.os_registration_answers.map((answer) => `<p><b>${escapeHtml(answer.os_event_questions?.label || "Question")}</b><span>${escapeHtml(answer.answer)}</span></p>`).join("")}</div>` : ""}
      <div class="dialog-actions"><button class="primary-button" type="submit">Save changes</button><button class="subtle-button" data-resend-confirmation="${item.id}" type="button">Resend confirmation</button>${item.payment_status === "paid" ? `<button class="danger-button" data-organizer-refund="${item.id}" type="button">Refund & cancel</button>` : `<button class="danger-button" data-organizer-cancel="${item.id}" type="button">Cancel entry</button>`}</div>
    </form></section>`;
}

function runnerRegistrationForm(item) {
  const activity = [...(item.os_registration_activity || [])].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return `<section class="modal"><div class="form-heading"><div><p>My registration</p><h2>${escapeHtml(item.os_events?.name || "Race")}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="runner-registration-form" data-registration-id="${item.id}">
      <div class="split-fields"><label>First name<input name="first_name" value="${escapeHtml(item.first_name)}" required></label><label>Last name<input name="last_name" value="${escapeHtml(item.last_name)}" required></label></div>
      <label>Email<input value="${escapeHtml(item.email)}" disabled></label><label>Emergency contact<input name="emergency_contact" value="${escapeHtml(item.emergency_contact)}" required></label>
      <div class="registration-facts"><span><b>Status</b>${escapeHtml(item.status)}</span><span><b>Payment</b>${escapeHtml(item.payment_status)}</span><span><b>Bib</b>${escapeHtml(item.bib_number || "Not assigned")}</span><span><b>Registration ID</b>${escapeHtml(item.id)}</span></div>
      ${item.os_registration_answers?.length ? `<div class="answer-list"><strong>Your answers</strong>${item.os_registration_answers.map((answer) => `<p><b>${escapeHtml(answer.os_event_questions?.label || "Question")}</b><span>${escapeHtml(answer.answer)}</span></p>`).join("")}</div>` : ""}
      <button class="primary-button" type="submit">Save participant details</button>
    </form>
    <div class="self-service-actions">
      ${item.status === "confirmed" ? `<button class="primary-button" data-view-pass="${item.id}" type="button">View QR pass</button>` : ""}
      ${item.status === "confirmed" && item.os_events?.allow_transfers ? `<button class="subtle-button" data-create-transfer="${item.id}" type="button">Create transfer link</button>` : ""}
      ${item.status === "confirmed" && item.os_events?.allow_refund_requests ? `<button class="danger-button" data-request-cancel="${item.id}" type="button">Request cancellation</button>` : ""}
    </div>
    ${item.transfer_token ? `<div class="transfer-link"><b>Active transfer link</b><input readonly value="${location.origin}${location.pathname}?transfer=${item.transfer_token}"><small>Expires ${displayDate(item.transfer_expires_at)}</small></div>` : ""}
    <div class="activity-list"><h3>Activity</h3>${activity.map((entry) => `<p><span>${escapeHtml(entry.action.replaceAll("_"," "))}</span><small>${new Date(entry.created_at).toLocaleString()}</small></p>`).join("") || "<p>No changes recorded yet.</p>"}</div>
  </section>`;
}

function acceptTransferForm(token) {
  return `<section class="modal"><div class="form-heading"><div><p>Registration transfer</p><h2>Accept this entry</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="accept-transfer-form" data-token="${escapeHtml(token)}"><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Emergency contact<input name="emergency_contact" required></label><label class="check-label"><input type="checkbox" required> I accept the event waiver and this transferred registration.</label><button class="primary-button" type="submit">Accept transfer</button></form>
  </section>`;
}

function registrationSettingsForm(event) {
  const questions = event.os_event_questions || [];
  return `<section class="modal"><div class="form-heading"><div><p>Registration form</p><h2>Questions & waiver</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="registration-settings-form" data-event-id="${event.id}"><label>Waiver text<textarea name="waiver_text" rows="6" placeholder="Leave blank to disable the waiver">${escapeHtml(event.waiver_text || "")}</textarea></label>
      <div class="split-fields"><label>Participant edits close<input name="participant_edits_close_at" type="datetime-local" value="${localDateTime(event.participant_edits_close_at)}"></label><label>Transfers close<input name="transfers_close_at" type="datetime-local" value="${localDateTime(event.transfers_close_at)}"></label></div>
      <label>Refund requests close<input name="refunds_close_at" type="datetime-local" value="${localDateTime(event.refunds_close_at)}"></label>
      <div class="split-fields"><label class="check-label"><input name="allow_transfers" type="checkbox" ${event.allow_transfers !== false ? "checked" : ""}> Allow transfers</label><label class="check-label"><input name="allow_refund_requests" type="checkbox" ${event.allow_refund_requests !== false ? "checked" : ""}> Allow cancellation requests</label></div>
      <button class="subtle-button" type="submit">Save self-service settings</button></form>
    <h3>Custom questions</h3>
    <div class="question-list">${questions.map((question) => `<div><span><b>${escapeHtml(question.label)}</b><small>${question.field_type}${question.required ? " · required" : ""}</small></span><button data-delete-question="${question.id}" data-event-id="${event.id}" type="button">Remove</button></div>`).join("") || "<p>No custom questions yet.</p>"}</div>
    <form id="question-form" data-event-id="${event.id}"><label>Question<input name="label" placeholder="Shirt size" required></label><div class="split-fields"><label>Answer type<select name="field_type"><option value="text">Text</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></select></label><label>Dropdown choices<input name="options" placeholder="XS, S, M, L, XL"></label></div><label class="check-label"><input name="required" type="checkbox"> Required</label><button class="primary-button" type="submit">Add question</button></form>
  </section>`;
}

function pricingSettingsForm(event) {
  const promos = event.os_promo_codes || [];
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Pricing & capacity</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="pricing-tier-list">${event.os_event_tiers.map((tier) => `<div><div><b>${escapeHtml(tier.name)}</b><small>Base ${money(tier.price_cents)} · Current ${money(effectivePrice(tier))} · Capacity ${tier.capacity}</small></div>
      <form class="scheduled-price-form" data-tier-id="${tier.id}" data-event-id="${event.id}"><input name="name" placeholder="Fall price" required><input name="price" type="number" min="0" step=".01" placeholder="Price" required><input name="starts_at" type="datetime-local" required><button class="subtle-button" type="submit">Schedule</button></form>
      <div class="price-schedule">${(tier.os_tier_prices || []).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).map((price) => `<span>${escapeHtml(price.name)} · ${money(price.price_cents)} · ${displayDate(price.starts_at)} <button data-delete-price="${price.id}" data-event-id="${event.id}" type="button">×</button></span>`).join("") || "<small>No scheduled changes.</small>"}</div>
    </div>`).join("")}</div>
    <h3>Promo codes</h3>
    <div class="promo-list">${promos.map((promo) => `<span><b>${escapeHtml(promo.code)}</b> · ${promo.discount_type === "percent" ? `${promo.discount_value / 100}%` : money(promo.discount_value)}${promo.max_redemptions ? ` · limit ${promo.max_redemptions}` : ""}</span>`).join("") || "<p>No promo codes yet.</p>"}</div>
    <form id="promo-form" data-event-id="${event.id}"><div class="split-fields"><label>Code<input name="code" required></label><label>Type<select name="discount_type"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label></div><div class="split-fields"><label>Value<input name="value" type="number" min=".01" step=".01" required></label><label>Usage limit<input name="max_redemptions" type="number" min="1"></label></div><div class="split-fields"><label>Starts<input name="starts_at" type="datetime-local"></label><label>Expires<input name="expires_at" type="datetime-local"></label></div><button class="primary-button" type="submit">Create promo code</button></form>
  </section>`;
}

function productSettingsForm(event) {
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Products & fundraising</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="product-admin-list">${(event.os_products || []).map((product) => `<article><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p>${product.os_product_variants.map((variant) => `<span>${escapeHtml(variant.name)} · ${money(variant.price_cents)} · ${variant.inventory === null ? "unlimited" : `${variant.inventory} inventory`}</span>`).join("")}</article>`).join("") || '<div class="empty-state">No products configured.</div>'}</div>
    <h3>Add product</h3><form id="product-form" data-event-id="${event.id}"><label>Product name<input name="name" placeholder="Race shirt" required></label><label>Description<input name="description"></label><div class="split-fields"><label>First variant<input name="variant_name" placeholder="Medium" required></label><label>Price<input name="price" type="number" min="0" step=".01" required></label></div><div class="split-fields"><label>Inventory<input name="inventory" type="number" min="0" placeholder="Blank for unlimited"></label><label>Fulfillment<select name="fulfillment_type"><option value="packet_pickup">Packet pickup</option><option value="digital">Digital</option><option value="none">No fulfillment</option></select></label></div><button class="primary-button" type="submit">Create product</button></form>
    <h3>Donations</h3><form id="donation-settings-form" data-event-id="${event.id}"><label class="check-label"><input name="donations_enabled" type="checkbox" ${event.donations_enabled ? "checked" : ""}> Accept donations during registration</label><div class="split-fields"><label>Beneficiary<input name="beneficiary_name" value="${escapeHtml(event.beneficiary_name || "")}"></label><label>Fundraising goal<input name="fundraising_goal" type="number" min="0" step=".01" value="${event.fundraising_goal_cents ? event.fundraising_goal_cents / 100 : ""}"></label></div><button class="subtle-button" type="submit">Save fundraising settings</button></form>
  </section>`;
}

function raceDayForm(event) {
  const entries = eventRegistrations(event.id).filter((item) => item.status === "confirmed");
  const pickedUp = entries.filter((item) => item.packet_picked_up_at).length;
  const checkedIn = entries.filter((item) => item.checked_in_at).length;
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Race-day operations</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="race-day-metrics"><span><b>${entries.length}</b>Confirmed</span><span><b>${pickedUp}</b>Packets picked up</span><span><b>${checkedIn}</b>Checked in</span></div>
    <div class="scanner-panel"><button class="primary-button" data-start-scanner="${event.id}" type="button">Scan QR pass</button><video id="qr-scanner" class="hidden" playsinline></video><p id="scanner-status"></p></div>
    <form id="race-day-lookup-form" data-event-id="${event.id}"><label>Find participant<input name="term" placeholder="Name, email, or bib" minlength="2" required></label><button class="primary-button" type="submit">Search</button></form>
    <div id="race-day-results"></div>
    <h3>Bib assignment</h3>
    <form id="bulk-bib-form" data-event-id="${event.id}"><div class="split-fields"><label>Registration option<select name="tier_id"><option value="">All options</option>${event.os_event_tiers.map((tier) => `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`).join("")}</select></label><label>Starting bib<input name="start_number" type="number" min="1" value="1" required></label></div><button class="subtle-button" type="submit">Assign unassigned bibs</button></form>
    <h3>Race-day staff</h3>
    <div class="staff-list">${(event.os_event_staff || []).map((staff) => `<span>${escapeHtml(staff.email)} · ${escapeHtml(staff.role)}</span>`).join("") || "<p>No staff assigned.</p>"}</div>
    <form id="staff-form" data-event-id="${event.id}"><div class="split-fields"><label>Verified account email<input name="email" type="email" required></label><label>Role<select name="role"><option value="scanner">Scanner</option><option value="packet_pickup">Packet pickup</option><option value="registration">Registration desk</option><option value="admin">Race-day admin</option></select></label></div><button class="subtle-button" type="submit">Add staff member</button></form>
    <h3>Walk-up registration</h3>
    <form id="walkup-form" data-event-id="${event.id}"><label>Entry<select name="tier_id">${event.os_event_tiers.map((tier) => `<option value="${tier.id}">${escapeHtml(tier.name)}</option>`).join("")}</select></label><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Email<input name="email" type="email" required></label><label>Emergency contact<input name="emergency_contact" required></label><label>Bib number<input name="bib_number"></label><button class="primary-button" type="submit">Add and confirm walk-up</button></form>
  </section>`;
}

function raceDayResults(items) {
  return items.length ? `<div class="race-day-results">${items.map((item) => { const products = item.os_orders?.os_order_items?.filter((orderItem) => orderItem.item_type === "product") || []; return `<div><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)} · ${escapeHtml(item.os_event_tiers?.name || "")} · Bib ${escapeHtml(item.bib_number || "—")}</small>${products.map((product) => `<small class="fulfillment-item">${escapeHtml(product.name)} × ${product.quantity} <button data-fulfill-item="${product.id}" type="button">${product.fulfilled_at ? "✓ Fulfilled" : "Mark fulfilled"}</button></small>`).join("")}</span><span class="checkin-actions"><button class="subtle-button" data-pickup="${item.id}" type="button">${item.packet_picked_up_at ? "✓ Packet" : "Mark packet"}</button><button class="primary-button" data-checkin="${item.id}" type="button">${item.checked_in_at ? "✓ Checked in" : "Check in"}</button></span></div>`; }).join("")}</div>` : '<div class="empty-state">No matching participants.</div>';
}

function passForm(item, pass) {
  return `<section class="modal pass-modal"><div class="form-heading"><div><p>Race-day pass</p><h2>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><div class="pass-qr">${pass.qrSvg}</div><div class="registration-facts"><span><b>Race</b>${escapeHtml(item.os_events?.name || "")}</span><span><b>Bib</b>${escapeHtml(item.bib_number || "Not assigned")}</span><span><b>Entry</b>${escapeHtml(item.os_event_tiers?.name || "")}</span><span><b>Status</b>${escapeHtml(item.status)}</span></div><p class="pass-note">Show this code at packet pickup or check-in.</p></section>`;
}

async function startQrScanner(eventId) {
  if (!("BarcodeDetector" in window)) throw new Error("QR scanning requires a current Chrome or Edge browser.");
  const video = document.querySelector("#qr-scanner");
  const status = document.querySelector("#scanner-status");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  video.srcObject = stream;
  video.classList.remove("hidden");
  await video.play();
  status.textContent = "Point the camera at an OpenStart QR pass.";
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const stop = () => stream.getTracks().forEach((track) => track.stop());
  const scan = async () => {
    if (!video.srcObject) return;
    const codes = await detector.detect(video).catch(() => []);
    if (codes[0]?.rawValue) {
      stop();
      video.srcObject = null;
      video.classList.add("hidden");
      const result = await raceDayAction("scan", { token: codes[0].rawValue });
      document.querySelector("#race-day-results").innerHTML = raceDayResults([result.registration]);
      status.textContent = "Pass verified.";
      return;
    }
    requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
}

function eventForm() {
  return `
    <section class="modal">
      <div class="form-heading"><div><p>New event</p><h2>Create a starting line</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
      <form id="event-form">
        <label>Event name<input name="name" placeholder="River City 10K" required></label>
        <div class="split-fields"><label>Date<input name="date" type="date" required></label><label>Location<input name="location" placeholder="Richmond, Virginia" required></label></div>
        <label>Description<textarea name="description" rows="3" required></textarea></label>
        <h3>First registration option</h3>
        <div class="split-fields"><label>Name<input name="tier_name" placeholder="10K" required></label><label>Distance<input name="distance" placeholder="6.2 miles" required></label></div>
        <div class="split-fields"><label>Price<input name="price" type="number" min="0" step="0.01" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div>
        <label class="check-label"><input name="publish" type="checkbox"> Publish immediately</label>
        <button class="primary-button" type="submit">Create event</button>
      </form>
    </section>`;
}

function openDialog(content) {
  dialogContent.innerHTML = content;
  dialog.showModal();
}
function stopScanner() {
  const video = document.querySelector("#qr-scanner");
  video?.srcObject?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}

function exportRoster(event) {
  const registrations = eventRegistrations(event.id);
  const headers = ["First name", "Last name", "Email", "Emergency contact", "Event", "Entry", "Bib", "Status", "Payment", "Amount", "Source", "Created"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = registrations.map((item) => [
    item.first_name, item.last_name, item.email, item.emergency_contact, event.name,
    tierById(event, item.tier_id)?.name || "", item.bib_number || "", item.status,
    item.payment_status, (item.amount_cents / 100).toFixed(2), item.registration_source || "online", item.created_at,
  ]);
  const blob = new Blob([[headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${event.slug}-registrations.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportFinancials() {
  const headers = ["Category", "Event", "Description", "Email", "Status", "Payment", "Base amount", "Discount", "Collected", "OpenStart fee", "Estimated organizer net", "Created"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = state.registrations.map((item) => {
    const race = eventById(item.event_id);
    const fee = Math.round(item.amount_cents * (race?.platform_fee_bps || 500) / 10000);
    return ["registration", race?.name, `${item.first_name} ${item.last_name}`, item.email, item.status, item.payment_status,
      ((item.base_amount_cents || item.amount_cents) / 100).toFixed(2), ((item.discount_cents || 0) / 100).toFixed(2),
      (item.amount_cents / 100).toFixed(2), (fee / 100).toFixed(2), ((item.amount_cents - fee) / 100).toFixed(2), item.created_at];
  });
  state.orderItems.forEach((item) => {
    const event = eventById(item.os_orders?.event_id);
    rows.push([item.item_type, event?.name || "", item.name, "", item.os_orders?.status || "", item.os_orders?.status === "paid" ? "paid" : "",
      (item.amount_cents / 100).toFixed(2), "0.00", (item.amount_cents / 100).toFixed(2), "0.00",
      (item.amount_cents / 100).toFixed(2), item.created_at]);
  });
  const blob = new Blob([[headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `openstart-financials-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function filterRoster(eventId) {
  const search = document.querySelector(`[data-roster-search="${eventId}"]`)?.value.toLowerCase() || "";
  const status = document.querySelector(`[data-roster-status="${eventId}"]`)?.value || "";
  document.querySelectorAll(".roster-manage [data-edit-registration]").forEach((row) => {
    row.classList.toggle("hidden", !row.dataset.search.includes(search) || (status && row.dataset.status !== status));
  });
}

async function loadPublic() {
  state.events = await listPublishedEvents();
  state.registrations = configured ? [] : await listRegistrations(state.events.map((event) => event.id));
}

async function loadDashboard() {
  const userId = state.session?.user?.id || DEMO_ORGANIZER_ID;
  [state.events, state.profile] = await Promise.all([
    listOrganizerEvents(userId),
    getOrganizerProfile(userId),
  ]);
  state.registrations = await listRegistrations(state.events.map((event) => event.id));
  state.orderItems = await listOrganizerOrderItems(state.events.map((event) => event.id));
}

async function loadRunnerDashboard() {
  [state.runnerRegistrations, state.captainTeams] = await Promise.all([
    listRunnerRegistrations(),
    listCaptainTeams(state.session.user.id),
  ]);
}

async function go(view) {
  if (["dashboard", "runner"].includes(view) && configured && !state.session) {
    state.pendingView = view;
    openDialog(authForm());
    return;
  }
  state.view = view;
  state.selectedEvent = null;
  if (view === "dashboard") {
    await loadDashboard();
    renderDashboard();
  } else if (view === "runner") {
    await loadRunnerDashboard();
    renderRunnerDashboard();
    if (state.pendingTransfer) openDialog(acceptTransferForm(state.pendingTransfer));
  } else {
    await loadPublic();
    renderDiscover();
  }
  syncNavigation();
  page.focus({ preventScroll: true });
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.matches("[data-view]")) await go(target.dataset.view);
  if (target.matches("[data-action='discover'], [data-back]")) await go("discover");
  if (target.matches("[data-go-dashboard]")) await go("dashboard");
  if (target.dataset.eventId) {
    state.selectedEvent = eventById(target.dataset.eventId);
    renderEvent(state.selectedEvent);
    scrollTo(0, 0);
  }
  if (target.dataset.register) openDialog(registrationForm(eventById(target.dataset.register)));
  if (target.matches("[data-add-participant-field]")) {
    const form = target.closest("form");
    const race = eventById(form.dataset.eventId);
    const container = form.querySelector("#participant-fields");
    const count = container.querySelectorAll(".participant-block").length;
    if (count >= 10) return showNotice("An order can contain up to 10 participants.");
    container.insertAdjacentHTML("beforeend", participantFields(race, count));
  }
  if (target.matches("[data-remove-participant]")) target.closest(".participant-block").remove();
  if (target.matches("[data-create-event]")) openDialog(eventForm());
  if (target.matches("[data-connect-stripe]")) {
    target.disabled = true;
    target.textContent = "Opening Stripe…";
    try {
      const url = await beginStripeOnboarding(`${location.origin}${location.pathname}?stripe=return`);
      location.assign(url);
    } catch (error) {
      target.disabled = false;
      showNotice(error.message || "Stripe onboarding could not start.");
      await go("dashboard");
    }
  }
  if (target.dataset.roster) renderRoster(eventById(target.dataset.roster));
  if (target.dataset.addParticipant) openDialog(manualRegistrationForm(eventById(target.dataset.addParticipant)));
  if (target.dataset.registrationSettings) openDialog(registrationSettingsForm(eventById(target.dataset.registrationSettings)));
  if (target.dataset.pricingSettings) openDialog(pricingSettingsForm(eventById(target.dataset.pricingSettings)));
  if (target.dataset.productSettings) openDialog(productSettingsForm(eventById(target.dataset.productSettings)));
  if (target.dataset.raceDay) openDialog(raceDayForm(eventById(target.dataset.raceDay)));
  if (target.dataset.startScanner) await startQrScanner(target.dataset.startScanner);
  if (target.dataset.exportRoster) exportRoster(eventById(target.dataset.exportRoster));
  if (target.matches("[data-export-finance]")) exportFinancials();
  if (target.dataset.editRegistration) {
    const item = state.registrations.find((registration) => registration.id === target.dataset.editRegistration);
    openDialog(editRegistrationForm(item));
  }
  if (target.dataset.manageRunner) {
    const item = state.runnerRegistrations.find((registration) => registration.id === target.dataset.manageRunner);
    openDialog(runnerRegistrationForm(item));
  }
  if (target.dataset.viewPass) {
    const item = state.runnerRegistrations.find((registration) => registration.id === target.dataset.viewPass);
    const pass = await raceDayAction("get_pass", { registrationId: item.id });
    openDialog(passForm(item, pass));
  }
  if (target.dataset.pickup) {
    await raceDayAction("pickup", { registrationId: target.dataset.pickup });
    target.textContent = "✓ Packet";
    target.disabled = true;
    showNotice("Packet pickup recorded.");
  }
  if (target.dataset.checkin) {
    await raceDayAction("checkin", { registrationId: target.dataset.checkin });
    target.textContent = "✓ Checked in";
    target.disabled = true;
    showNotice("Participant checked in.");
  }
  if (target.dataset.fulfillItem) {
    await updateOrderItem(target.dataset.fulfillItem, {});
    target.textContent = "✓ Fulfilled";
    target.disabled = true;
    showNotice("Merchandise marked fulfilled.");
  }
  if (target.dataset.createTransfer) {
    const result = await registrationAction("create_transfer", { registrationId: target.dataset.createTransfer });
    await loadRunnerDashboard();
    openDialog(runnerRegistrationForm(state.runnerRegistrations.find((item) => item.id === target.dataset.createTransfer)));
    await navigator.clipboard?.writeText(`${location.origin}${location.pathname}?transfer=${result.token}`).catch(() => {});
    showNotice("Transfer link created and copied. It expires in 7 days.");
  }
  if (target.dataset.requestCancel && confirm("Request cancellation for this registration? The organizer will review any refund.")) {
    await registrationAction("request_cancel", { registrationId: target.dataset.requestCancel });
    dialog.close();
    await go("runner");
    showNotice("Cancellation requested.");
  }
  if (target.dataset.organizerRefund && confirm("Issue a full Stripe refund and cancel this registration? This cannot be undone.")) {
    await registrationAction("organizer_refund", { registrationId: target.dataset.organizerRefund });
    dialog.close();
    await go("dashboard");
    showNotice("Registration refunded and cancelled.");
  }
  if (target.dataset.organizerCancel && confirm("Cancel this registration?")) {
    await registrationAction("organizer_cancel", { registrationId: target.dataset.organizerCancel });
    dialog.close();
    await go("dashboard");
    showNotice("Registration cancelled.");
  }
  if (target.dataset.resendConfirmation) {
    target.disabled = true;
    try {
      await resendConfirmation(target.dataset.resendConfirmation);
      showNotice("Confirmation email sent.");
    } catch (error) {
      showNotice(error.message || "Confirmation email could not be sent.");
    } finally {
      target.disabled = false;
    }
  }
  if (target.dataset.deleteQuestion) {
    await deleteEventQuestion(target.dataset.deleteQuestion);
    await loadDashboard();
    openDialog(registrationSettingsForm(eventById(target.dataset.eventId)));
    showNotice("Question removed.");
  }
  if (target.dataset.deletePrice) {
    await deleteScheduledPrice(target.dataset.deletePrice);
    await loadDashboard();
    openDialog(pricingSettingsForm(eventById(target.dataset.eventId)));
    showNotice("Scheduled price removed.");
  }
  if (target.matches("[data-close-roster]")) document.querySelector("#roster-slot").innerHTML = "";
  if (target.matches("[data-close-dialog]")) {
    stopScanner();
    dialog.close();
  }
  if (target.matches("[data-reset-demo]")) {
    resetDemo();
    await go("dashboard");
    showNotice("Demo data restored.");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset.rosterSearch) filterRoster(event.target.dataset.rosterSearch);
});
document.addEventListener("change", (event) => {
  if (event.target.dataset.rosterStatus) filterRoster(event.target.dataset.rosterStatus);
  if (event.target.dataset.waitlistId) {
    updateWaitlist(event.target.dataset.waitlistId, {
      status: event.target.value,
      invited_at: event.target.value === "invited" ? new Date().toISOString() : null,
    }).then(() => showNotice("Waitlist status updated.")).catch((error) => showNotice(error.message));
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === "auth-form") {
      const intent = event.submitter?.value || "signin";
      const credentials = { email: data.get("email"), password: data.get("password") };
      const result = intent === "signup"
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (!result.data.session) {
        form.querySelector(".form-message").textContent = "Check your email to confirm your account.";
        return;
      }
      state.session = result.data.session;
      dialog.close();
      await go(state.pendingView || "dashboard");
    }

    if (form.id === "registration-form") {
      const race = eventById(form.dataset.eventId);
      const participants = Array.from(form.querySelectorAll(".participant-block")).map((block) => ({
        tierId: block.querySelector("[data-field='tier_id']").value,
        firstName: block.querySelector("[name='first_name']").value,
        lastName: block.querySelector("[name='last_name']").value,
        email: block.querySelector("[name='email']").value,
        emergencyContact: block.querySelector("[name='emergency_contact']").value,
        relayLeg: block.querySelector("[name='relay_leg']").value || null,
        answers: Array.from(block.querySelectorAll("[data-question-id]")).map((input) => ({
          questionId: input.dataset.questionId,
          answer: input.type === "checkbox" ? (input.checked ? "Yes" : "") : input.value,
        })),
        waiverAccepted: !race.waiver_text || block.querySelector("[name='waiver']")?.checked === true,
        waiverVersion: race.waiver_text ? String(race.updated_at || race.id) : null,
        idempotencyKey: crypto.randomUUID(),
      }));
      const teamMode = data.get("team_mode");
      const items = Array.from(form.querySelectorAll(".product-options > div")).map((row) => ({
        variantId: row.querySelector("[data-product-variant]").value,
        quantity: Number(row.querySelector("[data-product-quantity]").value) || 1,
      })).filter((item) => item.variantId);
      const result = await beginRegistration({
        eventId: race.id,
        email: data.get("purchaser_email"),
        participants,
        team: teamMode ? {
          mode: teamMode,
          teamId: data.get("team_id") || null,
          name: data.get("team_name") || null,
          category: data.get("team_category"),
          joinCode: data.get("team_code") || null,
        } : null,
        items,
        donationCents: Math.max(0, Math.round(Number(data.get("donation_amount") || 0) * 100)),
        dedication: data.get("dedication") || null,
        anonymousDonation: data.get("anonymous_donation") === "on",
        promoCode: data.get("promo_code") || null,
        joinWaitlist: data.get("join_waitlist") === "on",
        idempotencyKey: crypto.randomUUID(),
        successUrl: `${location.origin}${location.pathname}`,
        cancelUrl: `${location.origin}${location.pathname}`,
      });
      if (result.checkoutUrl) {
        location.assign(result.checkoutUrl);
        return;
      }
      dialog.close();
      if (result.status === "waitlisted") {
        showNotice("This option is full. You have been added to the waitlist.");
        return;
      }
      await loadPublic();
      state.selectedEvent = eventById(race.id);
      renderEvent(state.selectedEvent);
      showNotice(result.status === "confirmed" ? "Registration confirmed." : "Registration saved.");
    }

    if (form.id === "manual-registration-form") {
      const race = eventById(form.dataset.eventId);
      await createManualRegistration({
        event_id: race.id,
        tier_id: data.get("tier_id"),
        first_name: data.get("first_name"),
        last_name: data.get("last_name"),
        email: data.get("email"),
        emergency_contact: data.get("emergency_contact"),
        bib_number: data.get("bib_number") || null,
        organizer_notes: data.get("organizer_notes") || "",
      });
      dialog.close();
      await loadDashboard();
      renderDashboard();
      renderRoster(eventById(race.id));
      showNotice("Manual registration added.");
    }

    if (form.id === "edit-registration-form") {
      const item = state.registrations.find((registration) => registration.id === form.dataset.registrationId);
      await updateRegistration(item.id, {
        first_name: data.get("first_name"),
        last_name: data.get("last_name"),
        email: data.get("email"),
        emergency_contact: data.get("emergency_contact"),
        bib_number: data.get("bib_number"),
        organizer_notes: data.get("organizer_notes"),
        status: data.get("status"),
      });
      dialog.close();
      await loadDashboard();
      renderDashboard();
      renderRoster(eventById(item.event_id));
      showNotice("Registration updated.");
    }

    if (form.id === "runner-registration-form") {
      await registrationAction("runner_update", {
        registrationId: form.dataset.registrationId,
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        emergencyContact: data.get("emergency_contact"),
      });
      dialog.close();
      await go("runner");
      showNotice("Participant details updated.");
    }

    if (form.id === "accept-transfer-form") {
      await registrationAction("accept_transfer", {
        token: form.dataset.token,
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        emergencyContact: data.get("emergency_contact"),
      });
      dialog.close();
      state.pendingTransfer = null;
      history.replaceState({}, "", location.pathname);
      await go("runner");
      showNotice("Registration transfer accepted.");
    }

    if (form.id === "registration-settings-form") {
      const asIso = (name) => data.get(name) ? new Date(data.get(name)).toISOString() : null;
      await updateEventSettings(form.dataset.eventId, {
        waiver_text: data.get("waiver_text") || "",
        participant_edits_close_at: asIso("participant_edits_close_at"),
        transfers_close_at: asIso("transfers_close_at"),
        refunds_close_at: asIso("refunds_close_at"),
        allow_transfers: data.get("allow_transfers") === "on",
        allow_refund_requests: data.get("allow_refund_requests") === "on",
      });
      await loadDashboard();
      openDialog(registrationSettingsForm(eventById(form.dataset.eventId)));
      showNotice("Waiver settings saved.");
    }

    if (form.id === "question-form") {
      const options = String(data.get("options") || "").split(",").map((item) => item.trim()).filter(Boolean);
      await createEventQuestion({
        event_id: form.dataset.eventId,
        label: data.get("label"),
        field_type: data.get("field_type"),
        options,
        required: data.get("required") === "on",
        sort_order: eventById(form.dataset.eventId).os_event_questions?.length || 0,
      });
      await loadDashboard();
      openDialog(registrationSettingsForm(eventById(form.dataset.eventId)));
      showNotice("Registration question added.");
    }

    if (form.matches(".scheduled-price-form")) {
      await createScheduledPrice({
        tier_id: form.dataset.tierId,
        name: data.get("name"),
        price_cents: Math.round(Number(data.get("price")) * 100),
        starts_at: new Date(data.get("starts_at")).toISOString(),
      });
      await loadDashboard();
      openDialog(pricingSettingsForm(eventById(form.dataset.eventId)));
      showNotice("Price change scheduled.");
    }

    if (form.id === "promo-form") {
      const percent = data.get("discount_type") === "percent";
      await createPromoCode({
        event_id: form.dataset.eventId,
        code: String(data.get("code")).trim().toUpperCase(),
        discount_type: data.get("discount_type"),
        discount_value: percent ? Math.round(Number(data.get("value")) * 100) : Math.round(Number(data.get("value")) * 100),
        max_redemptions: data.get("max_redemptions") ? Number(data.get("max_redemptions")) : null,
        starts_at: data.get("starts_at") ? new Date(data.get("starts_at")).toISOString() : null,
        expires_at: data.get("expires_at") ? new Date(data.get("expires_at")).toISOString() : null,
      });
      await loadDashboard();
      openDialog(pricingSettingsForm(eventById(form.dataset.eventId)));
      showNotice("Promo code created.");
    }

    if (form.id === "race-day-lookup-form") {
      const result = await raceDayAction("lookup", { eventId: form.dataset.eventId, term: data.get("term") });
      form.parentElement.querySelector("#race-day-results").innerHTML = raceDayResults(result.registrations || []);
    }

    if (form.id === "bulk-bib-form") {
      const result = await raceDayAction("bulk_assign_bibs", {
        eventId: form.dataset.eventId, tierId: data.get("tier_id") || null,
        startNumber: Number(data.get("start_number")),
      });
      await loadDashboard();
      openDialog(raceDayForm(eventById(form.dataset.eventId)));
      showNotice(`${result.assigned} bibs assigned.`);
    }

    if (form.id === "staff-form") {
      await raceDayAction("add_staff", {
        eventId: form.dataset.eventId, email: data.get("email"), role: data.get("role"),
      });
      await loadDashboard();
      openDialog(raceDayForm(eventById(form.dataset.eventId)));
      showNotice("Race-day staff member added.");
    }

    if (form.id === "walkup-form") {
      await raceDayAction("walkup", {
        eventId: form.dataset.eventId, tierId: data.get("tier_id"),
        firstName: data.get("first_name"), lastName: data.get("last_name"),
        email: data.get("email"), emergencyContact: data.get("emergency_contact"),
        bibNumber: data.get("bib_number") || null,
      });
      await loadDashboard();
      openDialog(raceDayForm(eventById(form.dataset.eventId)));
      showNotice("Walk-up participant added.");
    }

    if (form.id === "product-form") {
      await createProduct({
        event_id: form.dataset.eventId, name: data.get("name"),
        description: data.get("description") || "", fulfillment_type: data.get("fulfillment_type"),
      }, {
        name: data.get("variant_name"), price_cents: Math.round(Number(data.get("price")) * 100),
        inventory: data.get("inventory") === "" ? null : Number(data.get("inventory")),
      });
      await loadDashboard();
      openDialog(productSettingsForm(eventById(form.dataset.eventId)));
      showNotice("Product created.");
    }

    if (form.id === "donation-settings-form") {
      await updateEventSettings(form.dataset.eventId, {
        donations_enabled: data.get("donations_enabled") === "on",
        beneficiary_name: data.get("beneficiary_name") || null,
        fundraising_goal_cents: data.get("fundraising_goal") ? Math.round(Number(data.get("fundraising_goal")) * 100) : null,
      });
      await loadDashboard();
      openDialog(productSettingsForm(eventById(form.dataset.eventId)));
      showNotice("Fundraising settings saved.");
    }

    if (form.id === "event-form") {
      const name = data.get("name");
      await createEvent({
        organizer_id: state.session?.user?.id || DEMO_ORGANIZER_ID,
        slug: `${slugify(name)}-${Date.now().toString().slice(-6)}`,
        name,
        description: data.get("description"),
        starts_at: new Date(`${data.get("date")}T12:00:00`).toISOString(),
        location_name: data.get("location"),
        status: data.get("publish") ? "published" : "draft",
      }, {
        name: data.get("tier_name"),
        distance_label: data.get("distance"),
        price_cents: Math.round(Number(data.get("price")) * 100),
        capacity: Number(data.get("capacity")),
      });
      dialog.close();
      await go("dashboard");
      showNotice(`${name} was created.`);
    }
  } catch (error) {
    showNotice(error.message || "Something went wrong.");
  }
});

notice.querySelector("button").addEventListener("click", () => notice.classList.add("hidden"));
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  showNotice(event.reason?.message || "Something went wrong.");
});
authButton.addEventListener("click", () => configured ? openDialog(authForm()) : showNotice("Add Supabase credentials in config.js to enable accounts."));
signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  state.session = null;
  await go("discover");
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    stopScanner();
    dialog.close();
  }
});

async function boot() {
  setupBanner.classList.toggle("hidden", configured);
  if (configured) {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      syncNavigation();
    });
  }
  const params = new URLSearchParams(location.search);
  state.pendingTransfer = params.get("transfer");
  if (state.pendingTransfer) state.pendingView = "runner";
  await go(state.pendingTransfer ? "runner" : "discover");
  if (params.get("payment") === "success") {
    showNotice("Payment received. Stripe is confirming your registration.");
    history.replaceState({}, "", location.pathname);
  } else if (params.get("payment") === "cancelled") {
    showNotice("Checkout was cancelled. Your temporary spot will be released.");
    history.replaceState({}, "", location.pathname);
  } else if (params.get("stripe") === "return" && state.session) {
    await go("dashboard");
    showNotice("Stripe setup was saved. Status updates arrive automatically.");
    history.replaceState({}, "", location.pathname);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js");
}

boot().catch((error) => {
  page.innerHTML = `<section class="empty-state">OpenStart could not load: ${escapeHtml(error.message)}</section>`;
});
