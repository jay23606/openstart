import {
  configured, displayDate, escapeHtml, eventDay, eventMonth, money, slugify, supabase,
} from "./core.js";
import {
  beginRegistration, beginStripeOnboarding, createEvent, DEMO_ORGANIZER_ID,
  getOrganizerProfile, listOrganizerEvents, listPublishedEvents, listRegistrations,
  listRunnerRegistrations, resetDemo,
} from "./data.js";

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
  pendingView: "dashboard",
};

const eventById = (id) => state.events.find((event) => event.id === id);
const tierById = (event, id) => event?.os_event_tiers?.find((tier) => tier.id === id);
const eventRegistrations = (id) => state.registrations.filter((registration) => registration.event_id === id);

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
        <div class="hero-meta"><span><b>${published.length}</b> events</span><span><b>${published.reduce((sum, event) => sum + event.os_event_tiers.length, 0)}</b> distances</span><span><b>${money(Math.min(...published.flatMap((event) => event.os_event_tiers.map((tier) => tier.price_cents))))}</b> from</span></div>
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
              return `<div class="tier-row"><div><h3>${escapeHtml(tier.name)}</h3><p>${escapeHtml(tier.distance_label)} · ${tier.capacity - used} spots available</p></div><strong>${money(tier.price_cents)}</strong></div>`;
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
              <small>${escapeHtml(item.os_event_tiers?.name || "Entry")} · ${escapeHtml(item.os_event_tiers?.distance_label || "")}</small>
            </div>
            <div class="runner-entry-meta"><strong>${escapeHtml(item.status)}</strong><span>${money(item.amount_cents)}</span></div>
          </article>`).join("") : '<div class="empty-state">No registrations are linked to this email yet.</div>'}
      </div>
    </section>`;
}

function renderRoster(event) {
  const registrations = eventRegistrations(event.id);
  document.querySelector("#roster-slot").innerHTML = `
    <div class="dashboard-card roster-card">
      <div class="card-heading"><div><h2>${escapeHtml(event.name)} roster</h2><p>Participant contact and entry details.</p></div><button class="subtle-button" data-close-roster type="button">Close</button></div>
      ${registrations.length ? `<div class="roster">${registrations.map((item) => `
        <div><span class="avatar">${escapeHtml(item.first_name[0])}${escapeHtml(item.last_name[0])}</span>
        <span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)}</small></span>
        <span>${escapeHtml(tierById(event, item.tier_id)?.name || "Entry")}</span><span>${item.status}</span></div>`).join("")}</div>`
        : '<div class="empty-state">No registrations yet. Share the published event to get the first runner on the list.</div>'}
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

function registrationForm(event) {
  return `
    <section class="modal">
      <div class="form-heading"><div><p>Registration</p><h2>Your details</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
      <form id="registration-form" data-event-id="${event.id}">
        <label>Event<select name="tier_id" required>${event.os_event_tiers.map((tier) => `<option value="${tier.id}">${escapeHtml(tier.name)} · ${money(tier.price_cents)}</option>`).join("")}</select></label>
        <div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div>
        <label>Email<input name="email" type="email" required></label>
        <label>Emergency contact<input name="emergency_contact" placeholder="Name · phone" required></label>
        <button class="primary-button" type="submit">Complete registration</button>
      </form>
    </section>`;
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
}

async function loadRunnerDashboard() {
  state.runnerRegistrations = await listRunnerRegistrations();
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
  if (target.matches("[data-close-roster]")) document.querySelector("#roster-slot").innerHTML = "";
  if (target.matches("[data-close-dialog]")) dialog.close();
  if (target.matches("[data-reset-demo]")) {
    resetDemo();
    await go("dashboard");
    showNotice("Demo data restored.");
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
      const tier = tierById(race, data.get("tier_id"));
      const result = await beginRegistration({
        eventId: race.id,
        tierId: tier.id,
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        email: data.get("email"),
        emergencyContact: data.get("emergency_contact"),
        idempotencyKey: crypto.randomUUID(),
        successUrl: `${location.origin}${location.pathname}`,
        cancelUrl: `${location.origin}${location.pathname}`,
      });
      if (result.checkoutUrl) {
        location.assign(result.checkoutUrl);
        return;
      }
      dialog.close();
      await loadPublic();
      state.selectedEvent = eventById(race.id);
      renderEvent(state.selectedEvent);
      showNotice(result.status === "confirmed" ? "Registration confirmed." : "Registration saved.");
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
authButton.addEventListener("click", () => configured ? openDialog(authForm()) : showNotice("Add Supabase credentials in config.js to enable accounts."));
signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  state.session = null;
  await go("discover");
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
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
  await go("discover");
  const params = new URLSearchParams(location.search);
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
