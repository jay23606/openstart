import {
  configured, displayDate, escapeHtml, eventDay, eventMonth, money, slugify, supabase,
} from "./core.js?v=24";
import {
  accountAction, addSeriesEvent, beginRegistration, beginStripeOnboarding, createEvent, createEventQuestion, createSeries,
  communicationsAction, createEmailTemplate, createEventSection, createEventSponsor, createManualRegistration, createProduct, createPromoCode, createScheduledPrice, createVolunteerRole, createWave,
  deleteEventQuestion, deleteEventSection, deleteEventSponsor, deleteScheduledPrice, deleteWave, DEMO_ORGANIZER_ID, removeSeriesEvent,
  getOrganizerProfile, listAuditLog, listCaptainTeams, listEmailTemplates, listOrganizerCampaigns, listOrganizerEvents, listOrganizerOrderItems, listOrganizerSeries, listPublishedEvents, listPublishedSeries, listRegistrations,
  listMyVolunteerSignups, listRunnerRegistrations, raceDayAction, registrationAction, resendConfirmation, resetDemo, resultsAction, updateEventSettings,
  seriesAction, updateEventSections, updateOrderItem, updateRegistration, updateSeries, updateVolunteerSignup, updateWaitlist, joinVolunteerShift, uploadEventAsset, wavesAction,
} from "./data.js?v=24";

const page = document.querySelector("#page-content");
const dialog = document.querySelector("#app-dialog");
const dialogContent = document.querySelector("#dialog-content");
const notice = document.querySelector("#notice");
const authButton = document.querySelector("#auth-button");
const signOutButton = document.querySelector("#sign-out");
const setupBanner = document.querySelector("#setup-banner");
let draggedSectionId=null;

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
  campaigns: [],
  emailTemplates: [],
  volunteerSignups: [],
  auditLog: [],
  series: [],
  seriesStandings: null,
  pendingView: "runner",
  pendingTransfer: null,
};

const helpArticles=[
  {audience:"Start here",title:"Understanding OpenStart accounts",keywords:"account login runner organizer staff navigation",body:"One account can be a runner, organizer, team captain, volunteer, or race-day staff member. My races contains your registrations and volunteer shifts. Organizer contains events you own. Staff tools appear when an organizer assigns your verified account email."},
  {audience:"Runners",title:"Registering and paying",keywords:"runner registration checkout stripe card payment confirmation",body:"Open an event, choose Register now, enter each participant, then continue to Stripe Checkout for paid entries. OpenStart confirms a paid registration only after Stripe sends a verified webhook. The Sandbox badge means no real money is charged."},
  {audience:"Runners",title:"Teams, relays, waves, and transfers",keywords:"runner team relay corral wave pace transfer",body:"During registration you can join or create a team, enter relay legs, and select an eligible start wave. After signing in, open My races → Manage to update participant details, choose another open wave, request cancellation, or create a transfer link."},
  {audience:"Runners",title:"QR passes and official results",keywords:"runner qr pass bib result leaderboard timing",body:"Confirmed participants can open a signed QR pass from My races. Show it at packet pickup or check-in. Once an organizer publishes results, your official time appears in My races and on the searchable public leaderboard."},
  {audience:"Organizers",title:"Create and publish an event",keywords:"organizer create event publish website branding sections sponsor",body:"Open Organizer → Create event. Configure registration options first, then open the event roster. Website controls branding, content sections, sponsors, preview, and publishing. Draft events and draft website content are visible only to you."},
  {audience:"Organizers",title:"Stripe payments and payouts",keywords:"organizer stripe connect sandbox payment payout refund fee",body:"Select Connect Stripe sandbox and complete Stripe-hosted onboarding. The account must have charges and payouts enabled. Registration funds use destination charges; OpenStart retains the configured application fee. Use test card 4242 4242 4242 4242 in sandbox."},
  {audience:"Organizers",title:"Registration, pricing, and merchandise",keywords:"organizer roster question waiver promo waitlist price product donation inventory",body:"From an event roster you can manage participants, questions, waivers, scheduled pricing, promo codes, waitlists, products, inventory, donations, and financial exports. Payment and capacity decisions remain server-authoritative."},
  {audience:"Organizers",title:"Communications",keywords:"organizer email campaign resend template audience unsubscribe",body:"Open Communications to preview an audience, send yourself a test, save templates, schedule messages, and review deliveries. Participant delivery requires a verified Resend sending domain. Marketing campaigns respect unsubscribe records."},
  {audience:"Organizers",title:"Volunteers and race-day operations",keywords:"organizer volunteer shift staff scanner checkin packet pickup walkup bib",body:"Create volunteer roles and capacity-limited shifts from Volunteers. Race-day tools support staff roles, participant lookup, QR scanning, bib assignment, packet pickup, check-in, walk-up entries, and merchandise fulfillment."},
  {audience:"Organizers",title:"Results, waves, and race series",keywords:"organizer result csv timing wave corral series points standings",body:"Use Waves to configure corrals, start times, capacity, pace guidance, and bib ranges. Results accepts manual times or CSV imports. After publishing official results, Series automatically calculates individual and team championship standings."},
  {audience:"Race-day staff",title:"Using assigned staff tools",keywords:"staff scanner lookup packet pickup registration desk admin permissions",body:"Sign in with the exact verified email assigned by the organizer. Scanner staff can verify QR passes; packet-pickup staff can locate participants and mark packets; registration staff can assist walk-ups; race-day admins receive all operational permissions."},
  {audience:"Troubleshooting",title:"Common setup and browser issues",keywords:"help error cache refresh stripe resend email supabase camera",body:"If a recent release looks stale, perform one hard refresh so the service worker retrieves the newest assets. Camera scanning requires HTTPS and a current Chrome or Edge browser. Stripe Connect errors normally indicate incomplete onboarding or capabilities. Email errors commonly indicate an unverified Resend domain."},
];

const eventById = (id) => state.events.find((event) => event.id === id);
const tierById = (event, id) => event?.os_event_tiers?.find((tier) => tier.id === id);
const eventRegistrations = (id) => state.registrations.filter((registration) => registration.event_id === id);

function renderHelp() {
  setPageMetadata(
    "OpenStart Help — Guides for runners and organizers",
    "Learn how to register, manage races, accept test payments, communicate with participants, and run race day in OpenStart.",
  );
  const audiences = ["All", ...new Set(helpArticles.map((article) => article.audience))];
  page.innerHTML = `
    <section class="help-page">
      <div class="help-hero">
        <p class="eyebrow">OPENSTART HELP</p>
        <h1>How can we help?</h1>
        <p>Quick, plain-language guides for runners, organizers, volunteers, and race-day staff.</p>
        <label class="help-search">
          <span>Search help</span>
          <input data-help-search type="search" placeholder="Try “Stripe”, “transfer”, or “results”" autocomplete="off">
        </label>
      </div>
      <div class="help-content">
        <div class="help-filters" aria-label="Filter help topics">
          ${audiences.map((audience, index) => `<button class="${index === 0 ? "active" : ""}" data-help-filter="${escapeHtml(audience)}" type="button">${escapeHtml(audience)}</button>`).join("")}
        </div>
        <p class="help-count" aria-live="polite">${helpArticles.length} guides</p>
        <div class="help-grid">
          ${helpArticles.map((article) => `
            <details data-help-article data-help-audience="${escapeHtml(article.audience)}" data-help-searchable="${escapeHtml(`${article.audience} ${article.title} ${article.keywords} ${article.body}`.toLowerCase())}">
              <summary><span>${escapeHtml(article.audience)}</span>${escapeHtml(article.title)}</summary>
              <p>${escapeHtml(article.body)}</p>
            </details>
          `).join("")}
        </div>
        <aside class="help-support">
          <div><p class="eyebrow">STILL STUCK?</p><h2>Tell us what happened.</h2></div>
          <p>Include the page you were on and the exact error message. Never include passwords, Stripe secret keys, or other credentials.</p>
          <a class="primary-button" href="https://github.com/jay23606/openstart/issues/new" target="_blank" rel="noreferrer">Open a GitHub issue</a>
        </aside>
      </div>
    </section>`;
}
const effectivePrice = (tier) => {
  const now = Date.now();
  const active = (tier.os_tier_prices || []).filter((price) => new Date(price.starts_at).getTime() <= now)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return active[0]?.price_cents ?? tier.price_cents;
};
const localDateTime = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const resultTime = (milliseconds) => {
  if (milliseconds === null || milliseconds === undefined) return "—";
  const total=Math.floor(Number(milliseconds)/1000);
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  const seconds=total%60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1,"0")}:${String(seconds).padStart(2,"0")}`;
};
const parseResultTime = (value) => {
  const clean=String(value || "").trim();
  if(!clean) return null;
  if(/^\d+$/.test(clean)) return Number(clean)*1000;
  const parts=clean.split(":").map(Number);
  if(parts.some(Number.isNaN) || parts.length<2 || parts.length>3) throw new Error(`Invalid time: ${clean}`);
  return (parts.length===3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1])*1000;
};
const safeColor=(value)=>/^#[0-9a-f]{6}$/i.test(value || "") ? value : "#0f6b4f";
const safeUrl=(value)=>{try{const url=new URL(value);return ["http:","https:"].includes(url.protocol) ? url.href : "";}catch{return "";}};
const contentHtml=(value)=>escapeHtml(value || "").replace(/\n/g,"<br>");
function setPageMetadata(title="OpenStart — Open-source race registration",description="Great race days start in the open.",image="og.png"){
  document.title=title;
  document.querySelector('meta[name="description"]').content=description;
  document.querySelector('meta[property="og:title"]').content=title;
  document.querySelector('meta[property="og:description"]').content=description;
  document.querySelector('meta[property="og:image"]').content=image || "og.png";
}

function showNotice(message) {
  notice.querySelector("span").textContent = message;
  notice.classList.remove("hidden");
}

function healthForm(health) {
  return `<section class="modal"><div class="form-heading"><div><p>Platform status</p><h2>System health</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><div class="health-grid"><span><b class="${health.database ? "health-ok" : "health-bad"}">${health.database ? "Operational" : "Degraded"}</b>Database</span><span><b class="${health.stripeConfigured ? "health-ok" : "health-bad"}">${health.stripeConfigured ? "Configured" : "Missing"}</b>Stripe</span><span><b class="${health.emailConfigured ? "health-ok" : "health-bad"}">${health.emailConfigured ? "Configured" : "Missing"}</b>Email</span><span><b>${health.responseMs} ms</b>Health response</span></div><p class="health-checked">Checked ${new Date(health.checkedAt).toLocaleString()}</p></section>`;
}

function downloadJson(filename,value){
  const link=document.createElement("a");
  link.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  link.download=filename; link.click(); URL.revokeObjectURL(link.href);
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
  setPageMetadata();
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
    ${state.series.length ? `<section class="series-section"><div class="section-heading"><div><p class="eyebrow">Race more</p><h2>Series & championships</h2></div><span>${state.series.length} active series</span></div><div class="series-grid">${state.series.map((series)=>`<article style="--series-color:${safeColor(series.primary_color)}">${safeUrl(series.banner_url) ? `<img src="${escapeHtml(safeUrl(series.banner_url))}" alt="">` : ""}<div><p>${series.os_series_events?.length || 0} events</p><h3>${escapeHtml(series.name)}</h3><span>${escapeHtml(series.description)}</span><button data-view-series="${series.id}" type="button">View series standings →</button></div></article>`).join("")}</div></section>` : ""}
    <section class="open-promise">
      <div><p class="eyebrow">Built differently</p><h2>Your event platform should work for your community.</h2></div>
      <div class="promise-grid">
        <div><b>01</b><h3>Transparent by default</h3><p>Open code, understandable costs, and participant data that stays yours.</p></div>
        <div><b>02</b><h3>Ready for race day</h3><p>Registration, rosters, capacity, and exports in one focused workspace.</p></div>
        <div><b>03</b><h3>Made to extend</h3><p>Build the workflow your event needs without waiting on a closed platform.</p></div>
      </div>
    </section>`;
}

function renderEvent(event, preview=false) {
  const registrations = eventRegistrations(event.id);
  const customSite=event.website_published || preview;
  const sections=customSite ? [...(event.os_event_sections || [])].filter((section)=>preview || section.published).sort((a,b)=>a.sort_order-b.sort_order) : [];
  const sponsors=customSite ? [...(event.os_event_sponsors || [])].sort((a,b)=>a.sort_order-b.sort_order) : [];
  setPageMetadata(`${event.name} — OpenStart`,event.description,event.banner_url || event.logo_url || "og.png");
  page.innerHTML = `
    <section class="event-detail" style="--event-color:${safeColor(event.primary_color)}">
      <button class="back-button" data-back type="button">← All events</button>
      ${customSite && safeUrl(event.banner_url) ? `<div class="event-banner"><img src="${escapeHtml(safeUrl(event.banner_url))}" alt=""></div>` : ""}
      <div class="detail-hero">
        <div>${customSite && safeUrl(event.logo_url) ? `<img class="event-logo" src="${escapeHtml(safeUrl(event.logo_url))}" alt="${escapeHtml(event.name)} logo">` : ""}<p class="eyebrow">${displayDate(event.starts_at)} · ${escapeHtml(event.location_name)}</p><h1>${escapeHtml(event.name)}</h1><p>${escapeHtml(event.description)}</p></div>
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
          <div class="event-secondary-actions">${event.results_published_at ? `<button class="subtle-button results-link" data-view-results="${event.id}" type="button">View official results</button>` : ""}${event.os_volunteer_roles?.length ? `<button class="subtle-button results-link" data-volunteer="${event.id}" type="button">Volunteer</button>` : ""}</div>
          <div class="detail-note"><b>Simple for now, extensible later.</b><p>Registration is connected. Paid entries remain pending until a payment provider confirms them server-side.</p></div>
        </div>
        <aside class="registration-panel">
          <p>Registration is open</p><h2>Claim your spot</h2>
          <span>Your entry is saved immediately. Paid registrations are marked pending while payments are disabled.</span>
          <button class="primary-button" data-register="${event.id}" type="button">Register now</button>
        </aside>
      </div>
      ${event.os_waves?.length ? `<section class="public-start-list"><p class="eyebrow">Start plan</p><h2>Waves & corrals</h2><div>${[...event.os_waves].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).map((wave)=>`<span><b>${new Date(wave.starts_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</b><strong>${escapeHtml(wave.name)}</strong><small>${escapeHtml(tierById(event,wave.tier_id)?.name || "")} · capacity ${wave.capacity}</small></span>`).join("")}</div></section>` : ""}
      ${sections.length ? `<div class="event-content-sections">${sections.map((section)=>`<article class="event-content-${section.section_type}"><p class="eyebrow">${escapeHtml(section.section_type.replace("_"," "))}</p><h2>${escapeHtml(section.title)}</h2><div>${contentHtml(section.content)}</div>${safeUrl(section.link_url) ? `<a class="subtle-button" href="${escapeHtml(safeUrl(section.link_url))}" target="_blank" rel="noopener">${escapeHtml(section.link_label || "Learn more")}</a>` : ""}</article>`).join("")}</div>` : ""}
      ${sponsors.length ? `<section class="event-sponsors"><p class="eyebrow">Event partners</p><h2>Thank you to our sponsors</h2><div>${sponsors.map((sponsor)=>`<a href="${escapeHtml(safeUrl(sponsor.website_url) || "#")}" ${safeUrl(sponsor.website_url) ? 'target="_blank" rel="noopener"' : ""}>${safeUrl(sponsor.logo_url) ? `<img src="${escapeHtml(safeUrl(sponsor.logo_url))}" alt="${escapeHtml(sponsor.name)}">` : `<b>${escapeHtml(sponsor.name)}</b>`}<small>${escapeHtml(sponsor.sponsor_level)}</small></a>`).join("")}</div></section>` : ""}
    </section>`;
}

async function renderSeries(series) {
  const standings=await seriesAction("standings",{seriesId:series.id});
  state.seriesStandings=standings;
  setPageMetadata(`${series.name} — OpenStart`,series.description,series.banner_url || series.logo_url || "og.png");
  const events=[...(series.os_series_events || [])].sort((a,b)=>a.sort_order-b.sort_order);
  page.innerHTML=`<section class="series-page" style="--series-color:${safeColor(series.primary_color)}">
    <button class="back-button" data-back type="button">← All events</button>
    ${safeUrl(series.banner_url) ? `<div class="series-banner"><img src="${escapeHtml(safeUrl(series.banner_url))}" alt=""></div>` : ""}
    <div class="series-hero">${safeUrl(series.logo_url) ? `<img src="${escapeHtml(safeUrl(series.logo_url))}" alt="${escapeHtml(series.name)} logo">` : ""}<p class="eyebrow">Race series</p><h1>${escapeHtml(series.name)}</h1><p>${escapeHtml(series.description)}</p><div><span><b>${events.length}</b>events</span><span><b>${series.minimum_events}</b>required</span><span><b>${escapeHtml(series.tie_breaker.replace("_"," "))}</b>tie-breaker</span></div></div>
    <section class="series-calendar"><div class="section-heading"><div><p class="eyebrow">Series calendar</p><h2>Earn points at every finish</h2></div></div><div>${events.map((link)=>`<article><time>${displayDate(link.os_events?.starts_at)}</time><span><b>${escapeHtml(link.os_events?.name || "")}</b><small>${escapeHtml(link.os_events?.location_name || "")} · ${Number(link.points_multiplier)}× points</small></span>${link.os_events?.status==="published" ? `<button data-event-id="${link.event_id}" type="button">View race</button>` : ""}</article>`).join("") || '<div class="empty-state">Events are coming soon.</div>'}</div></section>
    <section class="standings-section"><div class="section-heading"><div><p class="eyebrow">Championship</p><h2>Individual standings</h2></div><button class="subtle-button" data-export-series="${series.id}" type="button">Export standings</button></div><div class="standings-table"><div class="standings-header"><span>Rank</span><span>Athlete</span><span>Events</span><span>Wins</span><span>Points</span></div>${standings.individual.map((row)=>`<div><span>${row.rank}</span><span><b>${escapeHtml(row.firstName)} ${escapeHtml(row.lastName)}</b><small>${row.eligible ? "Championship eligible" : `${series.minimum_events-row.eventsCompleted} more required`}</small></span><span>${row.eventsCompleted}</span><span>${row.wins}</span><span><b>${row.points}</b></span></div>`).join("") || '<div class="empty-state">Standings appear after published results.</div>'}</div></section>
    ${standings.teams.length ? `<section class="standings-section"><div class="section-heading"><div><p class="eyebrow">Clubs & teams</p><h2>Team standings</h2></div></div><div class="standings-table team-standings"><div class="standings-header"><span>Rank</span><span>Team</span><span>Members</span><span>Events</span><span>Points</span></div>${standings.teams.map((row)=>`<div><span>${row.rank}</span><span><b>${escapeHtml(row.name)}</b></span><span>${row.members}</span><span>${row.eventsCompleted}</span><span><b>${row.points}</b></span></div>`).join("")}</div></section>` : ""}
  </section>`;
}

function exportSeriesStandings(series) {
  const rows=[["rank","first_name","last_name","points","events_completed","wins","eligible"],...(state.seriesStandings?.individual || []).map((row)=>[row.rank,row.firstName,row.lastName,row.points,row.eventsCompleted,row.wins,row.eligible])];
  const csv=rows.map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));link.download=`${series.slug}-standings.csv`;link.click();URL.revokeObjectURL(link.href);
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
          <button class="subtle-button" data-system-health type="button">System health</button>
          <button class="subtle-button" data-series-manager type="button">Series</button>
          <button class="subtle-button" data-compose-campaign type="button">Communications</button>
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
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Communications</h2><p>Drafts, scheduled messages, and delivery status.</p></div><button class="subtle-button" data-compose-campaign type="button">+ New campaign</button></div>
        <div class="campaign-list">${state.campaigns.slice(0,8).map((campaign) => `<div><span><b>${escapeHtml(campaign.name)}</b><small>${escapeHtml(eventById(campaign.event_id)?.name || "")} · ${escapeHtml(campaign.message_type)}</small></span><span>${campaign.recipient_count} recipients</span><span><b class="campaign-status">${escapeHtml(campaign.status)}</b><small>${campaign.sent_count} sent · ${campaign.failed_count} failed</small></span></div>`).join("") || '<div class="empty-state">No campaigns yet.</div>'}</div>
      </div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Race series</h2><p>Championship calendars, points, and eligibility.</p></div><button class="subtle-button" data-series-manager type="button">Manage series</button></div><div class="campaign-list">${state.series.map((series)=>`<div><span><b>${escapeHtml(series.name)}</b><small>${series.os_series_events?.length || 0} events · minimum ${series.minimum_events}</small></span><span>${escapeHtml(series.status)}</span><span><button class="subtle-button" data-configure-series="${series.id}" type="button">Configure</button></span></div>`).join("") || '<div class="empty-state">No race series yet.</div>'}</div></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Audit trail</h2><p>Recent sensitive changes across your events.</p></div></div><div class="audit-list">${state.auditLog.slice(0,15).map((entry)=>`<p><span><b>${escapeHtml(entry.action)} ${escapeHtml(entry.table_name.replace("os_","").replaceAll("_"," "))}</b><small>${escapeHtml(eventById(entry.event_id)?.name || "Event")} · ${new Date(entry.created_at).toLocaleString()}</small></span><code>${escapeHtml(entry.record_id?.slice(0,8) || "system")}</code></p>`).join("") || '<div class="empty-state">No audited changes yet.</div>'}</div></div>
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
              ${item.os_results ? `<div class="runner-result"><b>${item.os_results.status === "finisher" ? resultTime(item.os_results.chip_time_ms ?? item.os_results.gun_time_ms) : item.os_results.status.toUpperCase()}</b><span>Official result${item.os_results.division ? ` · ${escapeHtml(item.os_results.division)}` : ""}</span></div>` : ""}
            </div>
            <div class="runner-entry-meta"><strong>${escapeHtml(item.status)}</strong><span>${money(item.amount_cents)}</span><button class="subtle-button" data-manage-runner="${item.id}" type="button">Manage</button></div>
          </article>`).join("") : '<div class="empty-state">No registrations are linked to this email yet.</div>'}
      </div>
      ${state.volunteerSignups.length ? `<div class="captain-dashboard"><div class="card-heading"><div><h2>My volunteer shifts</h2><p>Upcoming assignments and service history.</p></div></div>${state.volunteerSignups.map((signup)=>{const shift=signup.os_volunteer_shifts;const role=shift?.os_volunteer_roles;return `<article><h3>${escapeHtml(role?.name || "Volunteer")} <small>${escapeHtml(role?.os_events?.name || "")}</small></h3><p><span>${new Date(shift.starts_at).toLocaleString()} · ${escapeHtml(shift.location)}</span><b>${escapeHtml(signup.status)}</b></p>${signup.hours_worked!==null ? `<p><span>Recorded service</span><b>${signup.hours_worked} hours</b></p>` : ""}</article>`;}).join("")}</div>` : ""}
      ${state.captainTeams.length ? `<div class="captain-dashboard"><div class="card-heading"><div><h2>Teams I captain</h2><p>Member status and relay assignments.</p></div></div>${state.captainTeams.map((team) => `<article><h3>${escapeHtml(team.name)} <small>${escapeHtml(team.category)} · ${escapeHtml(team.os_events?.name || "")}</small></h3>${(team.os_registrations || []).map((member) => `<p><span>${escapeHtml(member.first_name)} ${escapeHtml(member.last_name)}${member.relay_leg ? ` · ${escapeHtml(member.relay_leg)}` : ""}</span><b>${escapeHtml(member.status)}</b></p>`).join("")}</article>`).join("")}</div>` : ""}
      <div class="privacy-card"><div><h2>Your data</h2><p>Download a portable copy of your OpenStart information or permanently delete a runner-only account.</p></div><span><button class="subtle-button" data-export-account type="button">Export my data</button><button class="danger-button" data-delete-account type="button">Delete account</button></span></div>
    </section>`;
}

function renderRoster(event) {
  const registrations = eventRegistrations(event.id);
  document.querySelector("#roster-slot").innerHTML = `
    <div class="dashboard-card roster-card">
      <div class="card-heading"><div><h2>${escapeHtml(event.name)} registrations</h2><p>Manage participants, volunteers, start groups, race-day details, and results.</p></div><div class="card-actions"><button class="subtle-button" data-site-editor="${event.id}" type="button">Website</button><button class="subtle-button" data-wave-manager="${event.id}" type="button">Waves</button><button class="subtle-button" data-volunteer-manager="${event.id}" type="button">Volunteers</button><button class="subtle-button" data-results-manager="${event.id}" type="button">Results</button><button class="subtle-button" data-close-roster type="button">Close</button></div></div>
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
  const waves=[...(event.os_waves || [])].filter((wave)=>wave.published && wave.self_select && (!wave.selection_closes_at || new Date(wave.selection_closes_at)>new Date())).sort((a,b)=>a.sort_order-b.sort_order);
  const defaultTier=event.os_event_tiers[0]?.id;
  return `<fieldset class="participant-block" data-participant-index="${index}"><legend>Participant ${index + 1}</legend>
        <label>Event<select data-field="tier_id" required>${event.os_event_tiers.map((tier) => `<option value="${tier.id}">${escapeHtml(tier.name)} · ${money(effectivePrice(tier))}</option>`).join("")}</select></label>
        ${waves.length ? `<div class="split-fields"><label>Start wave<select data-field="wave_id"><option value="">Assign me automatically</option>${waves.map((wave)=>`<option value="${wave.id}" data-tier="${wave.tier_id}" ${wave.tier_id!==defaultTier ? "hidden" : ""}>${escapeHtml(wave.name)} · ${new Date(wave.starts_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</option>`).join("")}</select></label><label>Estimated pace per mile<input data-field="estimated_pace" placeholder="9:30"></label></div>` : ""}
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
      <div class="registration-facts"><span><b>Status</b>${escapeHtml(item.status)}</span><span><b>Payment</b>${escapeHtml(item.payment_status)}</span><span><b>Bib</b>${escapeHtml(item.bib_number || "Not assigned")}</span><span><b>Wave</b>${escapeHtml(item.os_waves?.name || "Not assigned")}</span></div>
      ${item.os_registration_answers?.length ? `<div class="answer-list"><strong>Your answers</strong>${item.os_registration_answers.map((answer) => `<p><b>${escapeHtml(answer.os_event_questions?.label || "Question")}</b><span>${escapeHtml(answer.answer)}</span></p>`).join("")}</div>` : ""}
      <button class="primary-button" type="submit">Save participant details</button>
    </form>
    <div class="self-service-actions">
      ${item.status === "confirmed" ? `<button class="primary-button" data-view-pass="${item.id}" type="button">View QR pass</button>` : ""}
      ${item.status === "confirmed" && item.os_events?.os_waves?.some((wave)=>wave.tier_id===item.tier_id && wave.self_select) ? `<button class="subtle-button" data-runner-wave="${item.id}" type="button">Choose start wave</button>` : ""}
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

function siteEditorForm(event) {
  const sections=[...(event.os_event_sections || [])].sort((a,b)=>a.sort_order-b.sort_order);
  const sponsors=[...(event.os_event_sponsors || [])].sort((a,b)=>a.sort_order-b.sort_order);
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Event website</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="site-publish-state"><span><b>${event.website_published ? "Published" : "Draft"}</b>${event.website_published ? "Custom event content is public." : "Only the standard registration page is public."}</span><button class="subtle-button" data-preview-site="${event.id}" type="button">Preview site</button></div>
    <form id="site-branding-form" data-event-id="${event.id}"><div class="split-fields"><label>Brand color<input name="primary_color" type="color" value="${safeColor(event.primary_color)}"></label><label>Contact email<input name="contact_email" type="email" value="${escapeHtml(event.contact_email || "")}"></label></div><div class="split-fields"><label>Logo image<input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><label>Banner image<input name="banner" type="file" accept="image/png,image/jpeg,image/webp"></label></div><label class="check-label"><input name="website_published" type="checkbox" ${event.website_published ? "checked" : ""}> Publish custom website content</label><button class="primary-button" type="submit">Save branding & publishing</button></form>
    <h3>Page sections <small>Drag to reorder</small></h3><div id="site-section-list" class="site-section-list">${sections.map((section)=>`<article draggable="true" data-site-section-id="${section.id}"><span class="drag-handle">⋮⋮</span><div><b>${escapeHtml(section.title)}</b><small>${escapeHtml(section.section_type)} · ${section.published ? "visible" : "hidden"}</small></div><button data-delete-site-section="${section.id}" data-event="${event.id}" type="button">Delete</button></article>`).join("") || '<div class="empty-state">Add schedule, parking, course, FAQ, or other race information.</div>'}</div>
    <form id="site-section-form" data-event-id="${event.id}"><div class="split-fields"><label>Section type<select name="section_type"><option value="text">General text</option><option value="schedule">Schedule</option><option value="location">Parking & location</option><option value="course">Course details</option><option value="packet_pickup">Packet pickup</option><option value="faq">FAQ</option><option value="downloads">Downloads</option></select></label><label>Heading<input name="title" required></label></div><label>Content<textarea name="content" rows="5" required></textarea></label><div class="split-fields"><label>Optional link<input name="link_url" type="url" placeholder="https://…"></label><label>Link label<input name="link_label" placeholder="Download course map"></label></div><label class="check-label"><input name="published" type="checkbox" checked> Show this section</label><button class="subtle-button" type="submit">Add section</button></form>
    <h3>Sponsors</h3><div class="site-sponsor-list">${sponsors.map((sponsor)=>`<span>${sponsor.logo_url ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="">` : ""}<b>${escapeHtml(sponsor.name)}</b><small>${escapeHtml(sponsor.sponsor_level)}</small><button data-delete-sponsor="${sponsor.id}" data-event="${event.id}" type="button">×</button></span>`).join("") || "<p>No sponsors added.</p>"}</div>
    <form id="site-sponsor-form" data-event-id="${event.id}"><div class="split-fields"><label>Sponsor name<input name="name" required></label><label>Level<input name="sponsor_level" placeholder="Presenting sponsor"></label></div><div class="split-fields"><label>Website<input name="website_url" type="url"></label><label>Logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label></div><button class="subtle-button" type="submit">Add sponsor</button></form>
  </section>`;
}

function seriesManagerForm() {
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Championships</p><h2>Race series</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><div class="series-admin-list">${state.series.map((series)=>`<button data-configure-series="${series.id}" type="button"><span><b>${escapeHtml(series.name)}</b><small>${series.os_series_events?.length || 0} events · ${escapeHtml(series.status)}</small></span><strong>Configure →</strong></button>`).join("") || '<div class="empty-state">Create your first multi-event series.</div>'}</div><h3>Create series</h3><form id="series-form"><label>Name<input name="name" placeholder="OpenStart Summer Series" required></label><label>Description<textarea name="description" rows="3" required></textarea></label><div class="split-fields"><label>Minimum events<input name="minimum_events" type="number" min="1" value="2" required></label><label>Tie breaker<select name="tie_breaker"><option value="most_wins">Most wins</option><option value="best_finish">Best finish</option><option value="most_events">Most events</option></select></label></div><button class="primary-button" type="submit">Create series</button></form></section>`;
}

function seriesSettingsForm(series) {
  const linked=new Set((series.os_series_events || []).map((link)=>link.event_id));
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Series settings</p><h2>${escapeHtml(series.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><form id="series-settings-form" data-series-id="${series.id}"><label>Description<textarea name="description" rows="3">${escapeHtml(series.description)}</textarea></label><div class="split-fields"><label>Brand color<input name="primary_color" type="color" value="${safeColor(series.primary_color)}"></label><label>Status<select name="status">${["draft","published","archived"].map((status)=>`<option ${series.status===status ? "selected" : ""}>${status}</option>`).join("")}</select></label></div><div class="split-fields"><label>Minimum completed events<input name="minimum_events" type="number" min="1" value="${series.minimum_events}" required></label><label>Tie breaker<select name="tie_breaker"><option value="most_wins" ${series.tie_breaker==="most_wins" ? "selected" : ""}>Most wins</option><option value="best_finish" ${series.tie_breaker==="best_finish" ? "selected" : ""}>Best finish</option><option value="most_events" ${series.tie_breaker==="most_events" ? "selected" : ""}>Most events</option></select></label></div><label>Placement points <span class="optional-label">Comma separated</span><input name="points_schedule" value="${escapeHtml((series.points_schedule || []).join(","))}"></label><label>Finisher points after listed places<input name="participation_points" type="number" min="0" value="${series.participation_points}"></label><div class="split-fields"><label>Logo URL<input name="logo_url" type="url" value="${escapeHtml(series.logo_url || "")}"></label><label>Banner URL<input name="banner_url" type="url" value="${escapeHtml(series.banner_url || "")}"></label></div><button class="primary-button" type="submit">Save series settings</button></form><h3>Series calendar</h3><div class="series-event-admin">${(series.os_series_events || []).sort((a,b)=>a.sort_order-b.sort_order).map((link)=>`<span><b>${escapeHtml(link.os_events?.name || "")}</b><small>${Number(link.points_multiplier)}× points</small><button data-remove-series-event="${link.id}" data-series="${series.id}" type="button">Remove</button></span>`).join("") || "<p>No events linked.</p>"}</div><form id="series-event-form" data-series-id="${series.id}"><div class="split-fields"><label>Add event<select name="event_id">${state.events.filter((event)=>!linked.has(event.id)).map((event)=>`<option value="${event.id}">${escapeHtml(event.name)}</option>`).join("")}</select></label><label>Points multiplier<input name="points_multiplier" type="number" min=".1" step=".1" value="1"></label></div><button class="subtle-button" type="submit">Add event</button></form>${series.status==="published" ? `<button class="subtle-button" data-view-series="${series.id}" type="button">View public series</button>` : ""}</section>`;
}

function waveManagerForm(event) {
  const waves=[...(event.os_waves || [])].sort((a,b)=>a.sort_order-b.sort_order);
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Starts & corrals</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="wave-admin-list">${waves.map((wave)=>{const assigned=eventRegistrations(event.id).filter((registration)=>registration.wave_id===wave.id);return `<article><div><p>${new Date(wave.starts_at).toLocaleString()}</p><h3>${escapeHtml(wave.name)}</h3><small>${escapeHtml(tierById(event,wave.tier_id)?.name || "")} · ${assigned.length}/${wave.capacity} assigned${wave.bib_start ? ` · bibs ${wave.bib_start}–${wave.bib_end}` : ""}</small></div><span>${wave.gun_started_at ? `<b>Started ${new Date(wave.gun_started_at).toLocaleTimeString()}</b>` : `<button class="subtle-button" data-start-wave="${wave.id}" data-event="${event.id}" type="button">Start now</button>`}<button class="subtle-button" data-wave-bibs="${wave.id}" data-event="${event.id}" type="button">Assign bibs</button><button data-delete-wave="${wave.id}" data-event="${event.id}" type="button">Delete</button></span></article>`;}).join("") || '<div class="empty-state">Create the first start wave below.</div>'}</div>
    <h3>Create wave or corral</h3><form id="wave-form" data-event-id="${event.id}"><div class="split-fields"><label>Name<input name="name" placeholder="Wave 1 · Under 8:00 pace" required></label><label>Distance<select name="tier_id">${event.os_event_tiers.map((tier)=>`<option value="${tier.id}">${escapeHtml(tier.name)}</option>`).join("")}</select></label></div><div class="split-fields"><label>Start time<input name="starts_at" type="datetime-local" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div><div class="split-fields"><label>Minimum pace <span class="optional-label">MM:SS</span><input name="min_pace" placeholder="6:00"></label><label>Maximum pace <span class="optional-label">MM:SS</span><input name="max_pace" placeholder="8:00"></label></div><div class="split-fields"><label>First bib<input name="bib_start" type="number" min="1"></label><label>Last bib<input name="bib_end" type="number" min="1"></label></div><label>Runner selection closes<input name="selection_closes_at" type="datetime-local"></label><label class="check-label"><input name="self_select" type="checkbox" checked> Let runners choose this wave</label><button class="primary-button" type="submit">Create wave</button></form>
    <h3>Bulk assignment</h3><form id="wave-assignment-form" data-event-id="${event.id}"><label>Wave<select name="wave_id">${waves.map((wave)=>`<option value="${wave.id}">${escapeHtml(wave.name)}</option>`).join("")}</select></label><label>Unassigned participants<select name="registration_ids" multiple size="8">${eventRegistrations(event.id).filter((item)=>item.status==="confirmed" && !item.wave_id).map((item)=>`<option value="${item.id}">${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)} · ${escapeHtml(tierById(event,item.tier_id)?.name || "")}</option>`).join("")}</select></label><button class="subtle-button" type="submit">Assign selected runners</button></form>
  </section>`;
}

function runnerWaveForm(item) {
  const waves=(item.os_events?.os_waves || []).filter((wave)=>wave.tier_id===item.tier_id && wave.self_select && (!wave.selection_closes_at || new Date(wave.selection_closes_at)>new Date())).sort((a,b)=>a.sort_order-b.sort_order);
  return `<section class="modal"><div class="form-heading"><div><p>Start assignment</p><h2>Choose your wave</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><form id="runner-wave-form" data-event-id="${item.event_id}" data-registration-id="${item.id}"><label>Wave<select name="wave_id" required>${waves.map((wave)=>`<option value="${wave.id}" ${item.wave_id===wave.id ? "selected" : ""}>${escapeHtml(wave.name)} · ${new Date(wave.starts_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</option>`).join("")}</select></label><label>Estimated pace per mile<input name="estimated_pace" value="${item.estimated_pace_seconds ? resultTime(item.estimated_pace_seconds*1000) : ""}" placeholder="9:30"></label><button class="primary-button" type="submit">Save start wave</button></form></section>`;
}

function volunteerOpportunitiesForm(event) {
  const shifts=(event.os_volunteer_roles || []).flatMap((role)=>(role.os_volunteer_shifts || []).map((shift)=>({role,shift})))
    .filter(({shift})=>new Date(shift.ends_at)>new Date()).sort((a,b)=>new Date(a.shift.starts_at)-new Date(b.shift.starts_at));
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Join the race-day team</p><h2>Volunteer at ${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="volunteer-opportunities">${shifts.map(({role,shift})=>`<article><div><p>${new Date(shift.starts_at).toLocaleString()}–${new Date(shift.ends_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</p><h3>${escapeHtml(role.name)}</h3><span>${escapeHtml(role.description)}</span><small>${escapeHtml(shift.location)} · ${shift.capacity} spots${role.minimum_age ? ` · Age ${role.minimum_age}+` : ""}</small></div><button class="primary-button" data-volunteer-shift="${shift.id}" data-event="${event.id}" type="button">Choose shift</button></article>`).join("") || '<div class="empty-state">No volunteer shifts are currently open.</div>'}</div>
  </section>`;
}

function volunteerSignupForm(event,shiftId) {
  const role=(event.os_volunteer_roles || []).find((item)=>item.os_volunteer_shifts?.some((shift)=>shift.id===shiftId));
  const shift=role?.os_volunteer_shifts?.find((item)=>item.id===shiftId);
  return `<section class="modal"><div class="form-heading"><div><p>${escapeHtml(role?.name || "Volunteer")}</p><h2>Sign up to help</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="shift-summary"><b>${new Date(shift.starts_at).toLocaleString()}</b><span>${escapeHtml(shift.location)}</span>${role.requirements ? `<p>${escapeHtml(role.requirements)}</p>` : ""}</div>
    <form id="volunteer-signup-form" data-shift-id="${shiftId}"><div class="split-fields"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label></div><label>Email<input name="email" type="email" value="${escapeHtml(state.session?.user?.email || "")}" required></label><label>Phone<input name="phone" type="tel"></label><label>Emergency contact<input name="emergency_contact"></label><label>Notes or accommodations<textarea name="notes" rows="3"></textarea></label>${role.waiver_text ? `<div class="waiver-box"><p>${escapeHtml(role.waiver_text)}</p><label class="check-label"><input name="waiver" type="checkbox" required> I accept the volunteer waiver</label></div>` : ""}<button class="primary-button" type="submit">Join this shift</button></form>
  </section>`;
}

function volunteerManagerForm(event) {
  const signups=(event.os_volunteer_roles || []).flatMap((role)=>(role.os_volunteer_shifts || []).flatMap((shift)=>(shift.os_volunteer_signups || []).map((signup)=>({role,shift,signup}))));
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Volunteer operations</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="volunteer-summary"><span><b>${signups.filter(({signup})=>signup.status==="confirmed").length}</b>confirmed</span><span><b>${signups.filter(({signup})=>signup.status==="waitlisted").length}</b>waitlisted</span><span><b>${signups.filter(({signup})=>signup.checked_in_at).length}</b>checked in</span><button class="subtle-button" data-export-volunteers="${event.id}" type="button">Export CSV</button></div>
    <div class="volunteer-admin-list">${(event.os_volunteer_roles || []).map((role)=>`<article><h3>${escapeHtml(role.name)}</h3>${(role.os_volunteer_shifts || []).map((shift)=>`<div><b>${new Date(shift.starts_at).toLocaleString()}</b><small>${escapeHtml(shift.location)} · capacity ${shift.capacity} · ${(shift.os_volunteer_signups || []).filter((item)=>item.status==="confirmed").length} confirmed</small></div>`).join("")}</article>`).join("") || '<div class="empty-state">No volunteer roles yet.</div>'}</div>
    <h3>Create a role and first shift</h3><form id="volunteer-role-form" data-event-id="${event.id}"><div class="split-fields"><label>Role name<input name="name" placeholder="Course marshal" required></label><label>Minimum age<input name="minimum_age" type="number" min="0"></label></div><label>Description<input name="description" required></label><label>Requirements<input name="requirements" placeholder="Comfortable standing outdoors"></label><label>Volunteer waiver<textarea name="waiver_text" rows="3"></textarea></label><div class="split-fields"><label>Starts<input name="starts_at" type="datetime-local" required></label><label>Ends<input name="ends_at" type="datetime-local" required></label></div><div class="split-fields"><label>Location<input name="location" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div><label>Shift instructions<input name="instructions"></label><button class="primary-button" type="submit">Create volunteer shift</button></form>
    <h3>Volunteer roster</h3><form id="volunteer-roster-form" data-event-id="${event.id}"><div class="volunteer-roster">${signups.map(({role,shift,signup})=>`<div data-volunteer-signup-id="${signup.id}"><span><b>${escapeHtml(signup.first_name)} ${escapeHtml(signup.last_name)}</b><small>${escapeHtml(signup.email)} · ${escapeHtml(role.name)} · ${new Date(shift.starts_at).toLocaleString()}</small></span><select name="status">${["confirmed","waitlisted","completed","no_show","cancelled"].map((status)=>`<option ${signup.status===status ? "selected" : ""}>${status}</option>`).join("")}</select><label class="check-label"><input name="checked_in" type="checkbox" ${signup.checked_in_at ? "checked" : ""}> Checked in</label><input name="hours" type="number" min="0" step=".25" placeholder="Hours" value="${signup.hours_worked ?? ""}"></div>`).join("") || '<div class="empty-state">No volunteers have signed up.</div>'}</div>${signups.length ? '<button class="primary-button" type="submit">Save volunteer roster</button>' : ""}</form>
  </section>`;
}

function exportVolunteers(event) {
  const rows=[["role","shift_start","shift_end","location","first_name","last_name","email","phone","emergency_contact","status","checked_in","hours"]];
  for(const role of event.os_volunteer_roles || []) for(const shift of role.os_volunteer_shifts || []) for(const signup of shift.os_volunteer_signups || []) rows.push([
    role.name,shift.starts_at,shift.ends_at,shift.location,signup.first_name,signup.last_name,signup.email,signup.phone,signup.emergency_contact,signup.status,signup.checked_in_at || "",signup.hours_worked ?? "",
  ]);
  const csv=rows.map((row)=>row.map((value)=>`"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  const link=document.createElement("a"); link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); link.download=`${event.slug}-volunteers.csv`; link.click(); URL.revokeObjectURL(link.href);
}

function rankedResults(event) {
  const tierPlaces=new Map();
  const divisionPlaces=new Map();
  return (event.os_results || []).filter((item)=>item.published).sort((a,b)=>{
    if(a.status==="finisher" && b.status!=="finisher") return -1;
    if(a.status!=="finisher" && b.status==="finisher") return 1;
    return (a.chip_time_ms ?? a.gun_time_ms ?? Infinity)-(b.chip_time_ms ?? b.gun_time_ms ?? Infinity);
  }).map((item)=>{
    if(item.status!=="finisher") return {...item,overallPlace:null,tierPlace:null,divisionPlace:null};
    const tierPlace=(tierPlaces.get(item.tier_id) || 0)+1;
    tierPlaces.set(item.tier_id,tierPlace);
    const divisionKey=`${item.tier_id}:${item.division || ""}`;
    const divisionPlace=(divisionPlaces.get(divisionKey) || 0)+1;
    divisionPlaces.set(divisionKey,divisionPlace);
    return {...item,overallPlace:tierPlace,tierPlace,divisionPlace:item.division ? divisionPlace : null};
  });
}

function renderResults(event) {
  const rows=rankedResults(event);
  page.innerHTML=`<section class="results-page">
    <button class="back-button" data-event-id="${event.id}" type="button">← Event details</button>
    <div class="results-hero"><div><p class="eyebrow">Official results</p><h1>${escapeHtml(event.name)}</h1><p>${displayDate(event.starts_at)} · ${escapeHtml(event.location_name)}</p></div><strong>${rows.filter((item)=>item.status==="finisher").length}<span>finishers</span></strong></div>
    <div class="results-toolbar"><input data-results-search type="search" placeholder="Search name or bib"><select data-results-tier><option value="">All distances</option>${event.os_event_tiers.map((tier)=>`<option value="${tier.id}">${escapeHtml(tier.name)}</option>`).join("")}</select></div>
    <div class="results-table"><div class="results-header"><span>Place</span><span>Runner</span><span>Division</span><span>Chip time</span><span>Gun time</span></div>
      ${rows.map((item)=>`<div class="result-row" data-result-tier="${item.tier_id}" data-result-search="${escapeHtml(`${item.first_name} ${item.last_name} ${item.bib_number || ""}`.toLowerCase())}"><span>${item.overallPlace || "—"}</span><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>Bib ${escapeHtml(item.bib_number || "—")} · ${escapeHtml(tierById(event,item.tier_id)?.name || "")}${item.wave_id ? ` · ${escapeHtml(event.os_waves?.find((wave)=>wave.id===item.wave_id)?.name || "")}` : ""}</small></span><span>${escapeHtml(item.division || "Open")}${item.divisionPlace ? `<small>${item.divisionPlace} in division</small>` : ""}</span><span><b>${item.status==="finisher" ? resultTime(item.chip_time_ms ?? item.gun_time_ms) : item.status.toUpperCase()}</b></span><span>${item.status==="finisher" ? resultTime(item.gun_time_ms) : "—"}</span></div>`).join("") || '<div class="empty-state">No published results yet.</div>'}
    </div>
  </section>`;
}

function resultsManagerForm(event) {
  const current=new Map((event.os_results || []).map((item)=>[item.registration_id,item]));
  const participants=eventRegistrations(event.id).filter((item)=>item.status==="confirmed");
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Timing & scoring</p><h2>${escapeHtml(event.name)} results</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="result-publish-state"><b>${event.results_published_at ? "Results are public" : "Results are not published"}</b><span>${(event.os_results || []).length} saved results</span></div>
    <details class="csv-import"><summary>Import timing CSV</summary><p>Columns: <code>bib,chip_time,gun_time,status,division</code>. Times accept <code>MM:SS</code> or <code>HH:MM:SS</code>.</p><input id="results-csv-file" type="file" accept=".csv,text/csv"><textarea id="results-csv" rows="6" placeholder="bib,chip_time,gun_time,status,division&#10;101,24:31,25:02,finisher,M30-39"></textarea><button class="subtle-button" data-import-results="${event.id}" type="button">Import CSV</button></details>
    <form id="results-form" data-event-id="${event.id}">
      <div class="result-entry-list">${participants.map((registration)=>{
        const result=current.get(registration.id);
        return `<div class="result-entry" data-registration-id="${registration.id}"><span><b>${escapeHtml(registration.first_name)} ${escapeHtml(registration.last_name)}</b><small>Bib ${escapeHtml(registration.bib_number || "—")} · ${escapeHtml(tierById(event,registration.tier_id)?.name || "")}</small></span><label>Chip time<input name="chip_time" value="${resultTime(result?.chip_time_ms).replace("—","")}" placeholder="24:31"></label><label>Gun time<input name="gun_time" value="${resultTime(result?.gun_time_ms).replace("—","")}" placeholder="25:02"></label><label>Status<select name="result_status">${["finisher","dnf","dns","dq"].map((status)=>`<option ${result?.status===status ? "selected" : ""}>${status}</option>`).join("")}</select></label><label>Division<input name="division" value="${escapeHtml(result?.division || "")}" placeholder="M30-39"></label></div>`;
      }).join("") || '<div class="empty-state">There are no confirmed participants.</div>'}</div>
      <button class="primary-button" type="submit">Save corrections</button>
    </form>
    <div class="dialog-actions"><button class="subtle-button" data-unpublish-results="${event.id}" type="button">Unpublish</button><button class="subtle-button" data-notify-results="${event.id}" type="button">Email unnotified runners</button><button class="primary-button" data-publish-results="${event.id}" type="button">Publish results</button></div>
  </section>`;
}

function parseResultsCsv(text,event) {
  const lines=String(text).trim().split(/\r?\n/).filter(Boolean);
  if(lines.length<2) throw new Error("The CSV has no result rows");
  const parseLine=(line)=>{
    const cells=[]; let value=""; let quoted=false;
    for(let index=0;index<line.length;index++){const character=line[index];if(character==='"'){if(quoted && line[index+1]==='"'){value+='"';index++;}else quoted=!quoted;}else if(character==="," && !quoted){cells.push(value.trim());value="";}else value+=character;}
    cells.push(value.trim()); return cells;
  };
  const headers=parseLine(lines[0]).map((item)=>item.toLowerCase());
  if(!headers.includes("bib") || !headers.includes("chip_time")) throw new Error("CSV must include bib and chip_time columns");
  return lines.slice(1).map((line)=>{
    const values=parseLine(line); const row=Object.fromEntries(headers.map((header,index)=>[header,values[index] || ""]));
    const registration=eventRegistrations(event.id).find((item)=>String(item.bib_number)===row.bib);
    if(!registration) throw new Error(`Bib ${row.bib} was not found`);
    return {registrationId:registration.id,chipTimeMs:parseResultTime(row.chip_time),gunTimeMs:parseResultTime(row.gun_time),status:(row.status || "finisher").toLowerCase(),division:row.division || null};
  });
}

function campaignForm() {
  const firstEvent=state.events[0];
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Organizer communications</p><h2>Create a campaign</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="campaign-form">
      <div class="split-fields"><label>Event<select name="event_id">${state.events.map((event)=>`<option value="${event.id}">${escapeHtml(event.name)}</option>`).join("")}</select></label><label>Campaign name<input name="name" placeholder="Final race instructions" required></label></div>
      <label>Start from a template<select name="template_id"><option value="">Blank message</option>${state.emailTemplates.map((template)=>`<option value="${template.id}">${escapeHtml(template.name)}</option>`).join("")}</select></label>
      <div class="split-fields"><label>Audience<select name="audience_type"><option value="confirmed">All confirmed participants</option><option value="tier">Specific registration option</option><option value="wave">Specific start wave</option><option value="team">Specific team</option><option value="captains">Team captains</option><option value="waitlist">Waitlist</option><option value="missing_bib">Missing bib</option><option value="checked_in">Checked in</option><option value="not_checked_in">Not checked in</option></select></label><label>Message type<select name="message_type"><option value="transactional">Transactional event message</option><option value="marketing">Marketing</option></select></label></div>
      <div class="split-fields"><label>Registration option<select name="tier_id"><option value="">Choose when needed</option>${(firstEvent?.os_event_tiers || []).map((tier)=>`<option value="${tier.id}">${escapeHtml(tier.name)}</option>`).join("")}</select></label><label>Start wave<select name="wave_id"><option value="">Choose when needed</option>${(firstEvent?.os_waves || []).map((wave)=>`<option value="${wave.id}">${escapeHtml(wave.name)}</option>`).join("")}</select></label></div><label>Team<select name="team_id"><option value="">Choose when needed</option>${(firstEvent?.os_teams || []).map((team)=>`<option value="${team.id}">${escapeHtml(team.name)}</option>`).join("")}</select></label>
      <label>Subject<input name="subject" required></label><label>Message<textarea name="html_body" rows="9" placeholder="<p>Hi {{first_name}}, ...</p>" required></textarea></label>
      <p class="template-help">Variables: <code>{{first_name}}</code> and <code>{{event_name}}</code></p>
      <label>Schedule <span class="optional-label">Leave blank for a draft</span><input name="scheduled_at" type="datetime-local"></label>
      <div id="audience-preview" class="audience-preview">Preview the audience before sending.</div>
      <div class="dialog-actions"><button class="subtle-button" name="campaign_intent" value="preview" type="submit">Preview audience</button><button class="subtle-button" name="campaign_intent" value="test" type="submit">Send test to me</button><button class="subtle-button" name="campaign_intent" value="template" type="submit">Save as template</button><button class="subtle-button" name="campaign_intent" value="save" type="submit">Save draft/schedule</button><button class="primary-button" name="campaign_intent" value="send" type="submit">Send now</button></div>
    </form>
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
  return items.length ? `<div class="race-day-results">${items.map((item) => { const products = item.os_orders?.os_order_items?.filter((orderItem) => orderItem.item_type === "product") || []; return `<div><span><b>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</b><small>${escapeHtml(item.email)} · ${escapeHtml(item.os_event_tiers?.name || "")} · Bib ${escapeHtml(item.bib_number || "—")}${item.os_waves?.name ? ` · ${escapeHtml(item.os_waves.name)}` : ""}</small>${products.map((product) => `<small class="fulfillment-item">${escapeHtml(product.name)} × ${product.quantity} <button data-fulfill-item="${product.id}" type="button">${product.fulfilled_at ? "✓ Fulfilled" : "Mark fulfilled"}</button></small>`).join("")}</span><span class="checkin-actions"><button class="subtle-button" data-pickup="${item.id}" type="button">${item.packet_picked_up_at ? "✓ Packet" : "Mark packet"}</button><button class="primary-button" data-checkin="${item.id}" type="button">${item.checked_in_at ? "✓ Checked in" : "Check in"}</button></span></div>`; }).join("")}</div>` : '<div class="empty-state">No matching participants.</div>';
}

function passForm(item, pass) {
  return `<section class="modal pass-modal"><div class="form-heading"><div><p>Race-day pass</p><h2>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><div class="pass-qr">${pass.qrSvg}</div><div class="registration-facts"><span><b>Race</b>${escapeHtml(item.os_events?.name || "")}</span><span><b>Bib</b>${escapeHtml(item.bib_number || "Not assigned")}</span><span><b>Entry</b>${escapeHtml(item.os_event_tiers?.name || "")}</span><span><b>Wave</b>${escapeHtml(item.os_waves?.name || "Not assigned")}</span></div><p class="pass-note">Show this code at packet pickup or check-in.</p></section>`;
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
  requestAnimationFrame(()=>(dialog.querySelector("input:not([type='hidden']),select,textarea") || dialog.querySelector("button"))?.focus());
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
  [state.events,state.series] = await Promise.all([listPublishedEvents(),listPublishedSeries()]);
  state.registrations = configured ? [] : await listRegistrations(state.events.map((event) => event.id));
}

async function loadDashboard() {
  const userId = state.session?.user?.id || DEMO_ORGANIZER_ID;
  [state.events, state.profile] = await Promise.all([
    listOrganizerEvents(userId),
    getOrganizerProfile(userId),
  ]);
  state.series=await listOrganizerSeries(userId);
  state.registrations = await listRegistrations(state.events.map((event) => event.id));
  [state.orderItems,state.campaigns,state.emailTemplates,state.auditLog] = await Promise.all([
    listOrganizerOrderItems(state.events.map((event) => event.id)),
    listOrganizerCampaigns(state.events.map((event) => event.id)),
    listEmailTemplates(userId),
    listAuditLog(state.events.map((event)=>event.id)),
  ]);
}

async function loadRunnerDashboard() {
  [state.runnerRegistrations, state.captainTeams, state.volunteerSignups] = await Promise.all([
    listRunnerRegistrations(),
    listCaptainTeams(state.session.user.id),
    listMyVolunteerSignups(),
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
  } else if (view === "help") {
    renderHelp();
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
  if (target.matches("[data-help-filter]")) {
    const searchInput = document.querySelector("[data-help-search]");
    if (searchInput) searchInput.value = "";
    document.querySelectorAll("[data-help-filter]").forEach((button) => button.classList.toggle("active", button === target));
    const audience = target.dataset.helpFilter;
    document.querySelectorAll("[data-help-article]").forEach((article) => {
      article.classList.toggle("hidden", audience !== "All" && article.dataset.helpAudience !== audience);
    });
    const visible = document.querySelectorAll("[data-help-article]:not(.hidden)").length;
    document.querySelector(".help-count").textContent = `${visible} guide${visible === 1 ? "" : "s"}`;
  }
  if (target.matches("[data-action='discover'], [data-back]")) {
    history.replaceState({},"",location.pathname);
    await go("discover");
  }
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
  if (target.matches("[data-series-manager]")) openDialog(seriesManagerForm());
  if (target.dataset.configureSeries) openDialog(seriesSettingsForm(state.series.find((series)=>series.id===target.dataset.configureSeries)));
  if (target.dataset.viewSeries) {
    dialog.close();
    history.replaceState({},"",`${location.pathname}?series=${target.dataset.viewSeries}`);
    await renderSeries(state.series.find((series)=>series.id===target.dataset.viewSeries));
    scrollTo(0,0);
  }
  if (target.dataset.exportSeries) exportSeriesStandings(state.series.find((series)=>series.id===target.dataset.exportSeries));
  if (target.dataset.removeSeriesEvent) {
    await removeSeriesEvent(target.dataset.removeSeriesEvent);
    await loadDashboard();
    openDialog(seriesSettingsForm(state.series.find((series)=>series.id===target.dataset.series)));
    showNotice("Event removed from series.");
  }
  if (target.matches("[data-system-health]")) openDialog(healthForm(await accountAction("health")));
  if (target.matches("[data-export-account]")) {
    const accountExport=await accountAction("export");
    downloadJson(`openstart-data-${new Date().toISOString().slice(0,10)}.json`,accountExport);
    showNotice("Your OpenStart data export was downloaded.");
  }
  if (target.matches("[data-delete-account]")) {
    if(!confirm("Permanently delete your OpenStart account and anonymize your runner data? This cannot be undone.")) return;
    if(!confirm("Final confirmation: delete this account now?")) return;
    await accountAction("delete");
    state.session=null;
    await go("discover");
    showNotice("Your account was deleted and participant data was anonymized.");
  }
  if (target.matches("[data-compose-campaign]")) openDialog(campaignForm());
  if (target.dataset.siteEditor) openDialog(siteEditorForm(eventById(target.dataset.siteEditor)));
  if (target.dataset.waveManager) openDialog(waveManagerForm(eventById(target.dataset.waveManager)));
  if (target.dataset.runnerWave) openDialog(runnerWaveForm(state.runnerRegistrations.find((item)=>item.id===target.dataset.runnerWave)));
  if (target.dataset.deleteWave) {
    await deleteWave(target.dataset.deleteWave);
    await loadDashboard();
    openDialog(waveManagerForm(eventById(target.dataset.event)));
    showNotice("Wave deleted.");
  }
  if (target.dataset.startWave) {
    await wavesAction("start",{eventId:target.dataset.event,waveId:target.dataset.startWave});
    await loadDashboard();
    openDialog(waveManagerForm(eventById(target.dataset.event)));
    showNotice("Wave start time recorded.");
  }
  if (target.dataset.waveBibs) {
    const result=await wavesAction("assign_bibs",{eventId:target.dataset.event,waveId:target.dataset.waveBibs});
    await loadDashboard();
    openDialog(waveManagerForm(eventById(target.dataset.event)));
    showNotice(`${result.assigned} bibs assigned.`);
  }
  if (target.dataset.previewSite) {
    const race=eventById(target.dataset.previewSite);
    dialog.close();
    renderEvent(race,true);
    showNotice("Previewing draft website content.");
  }
  if (target.dataset.deleteSiteSection) {
    await deleteEventSection(target.dataset.deleteSiteSection);
    await loadDashboard();
    openDialog(siteEditorForm(eventById(target.dataset.event)));
    showNotice("Section deleted.");
  }
  if (target.dataset.deleteSponsor) {
    await deleteEventSponsor(target.dataset.deleteSponsor);
    await loadDashboard();
    openDialog(siteEditorForm(eventById(target.dataset.event)));
    showNotice("Sponsor deleted.");
  }
  if (target.dataset.volunteer) openDialog(volunteerOpportunitiesForm(eventById(target.dataset.volunteer)));
  if (target.dataset.volunteerShift) openDialog(volunteerSignupForm(eventById(target.dataset.event),target.dataset.volunteerShift));
  if (target.dataset.volunteerManager) openDialog(volunteerManagerForm(eventById(target.dataset.volunteerManager)));
  if (target.dataset.exportVolunteers) exportVolunteers(eventById(target.dataset.exportVolunteers));
  if (target.dataset.viewResults) renderResults(eventById(target.dataset.viewResults));
  if (target.dataset.resultsManager) openDialog(resultsManagerForm(eventById(target.dataset.resultsManager)));
  if (target.dataset.importResults) {
    const race=eventById(target.dataset.importResults);
    const rows=parseResultsCsv(document.querySelector("#results-csv").value,race);
    await resultsAction("save_many",{eventId:race.id,results:rows});
    await loadDashboard();
    openDialog(resultsManagerForm(eventById(race.id)));
    showNotice(`${rows.length} results imported.`);
  }
  if (target.dataset.publishResults) {
    const eventId=target.dataset.publishResults;
    await resultsAction("publish",{eventId,sendEmail:false});
    await loadDashboard();
    openDialog(resultsManagerForm(eventById(eventId)));
    showNotice("Official results are now public.");
  }
  if (target.dataset.unpublishResults) {
    const eventId=target.dataset.unpublishResults;
    await resultsAction("unpublish",{eventId});
    await loadDashboard();
    openDialog(resultsManagerForm(eventById(eventId)));
    showNotice("Results unpublished.");
  }
  if (target.dataset.notifyResults) {
    const result=await resultsAction("notify",{eventId:target.dataset.notifyResults});
    showNotice(`${result.email?.sent || 0} result emails sent${result.email?.failed ? ` · ${result.email.failed} failed` : ""}.`);
  }
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
      await go(state.pendingView || "runner");
    }

    if (form.id === "series-form") {
      const name=data.get("name");
      const series=await createSeries({
        organizer_id:state.session.user.id,name,slug:`${slugify(name)}-${Date.now().toString().slice(-6)}`,
        description:data.get("description"),minimum_events:Number(data.get("minimum_events")),
        tie_breaker:data.get("tie_breaker"),
      });
      await loadDashboard();
      openDialog(seriesSettingsForm(state.series.find((item)=>item.id===series.id)));
      showNotice("Race series created.");
    }

    if (form.id === "series-settings-form") {
      const points=String(data.get("points_schedule")).split(",").map((value)=>Number(value.trim())).filter((value)=>Number.isFinite(value) && value>=0);
      if(!points.length) throw new Error("Enter at least one placement point value");
      await updateSeries(form.dataset.seriesId,{
        description:data.get("description"),primary_color:data.get("primary_color"),status:data.get("status"),
        minimum_events:Number(data.get("minimum_events")),tie_breaker:data.get("tie_breaker"),
        points_schedule:points,participation_points:Number(data.get("participation_points")),
        logo_url:data.get("logo_url") || null,banner_url:data.get("banner_url") || null,updated_at:new Date().toISOString(),
      });
      await loadDashboard();
      openDialog(seriesSettingsForm(state.series.find((series)=>series.id===form.dataset.seriesId)));
      showNotice("Series settings saved.");
    }

    if (form.id === "series-event-form") {
      if(!data.get("event_id")) throw new Error("Choose an event to add");
      const series=state.series.find((item)=>item.id===form.dataset.seriesId);
      await addSeriesEvent({
        series_id:series.id,event_id:data.get("event_id"),points_multiplier:Number(data.get("points_multiplier")),
        sort_order:(series.os_series_events || []).length,
      });
      await loadDashboard();
      openDialog(seriesSettingsForm(state.series.find((item)=>item.id===series.id)));
      showNotice("Event added to series.");
    }

    if (form.id === "registration-form") {
      const race = eventById(form.dataset.eventId);
      const participants = Array.from(form.querySelectorAll(".participant-block")).map((block) => ({
        tierId: block.querySelector("[data-field='tier_id']").value,
        waveId: block.querySelector("[data-field='wave_id']")?.value || null,
        estimatedPaceSeconds: block.querySelector("[data-field='estimated_pace']")?.value ? Math.round(parseResultTime(block.querySelector("[data-field='estimated_pace']").value)/1000) : null,
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

    if (form.id === "campaign-form") {
      const intent=event.submitter?.value || "preview";
      const audience={type:data.get("audience_type"),tierId:data.get("tier_id") || null,waveId:data.get("wave_id") || null,teamId:data.get("team_id") || null};
      const common={eventId:data.get("event_id"),audience,subject:data.get("subject"),htmlBody:data.get("html_body")};
      if(intent==="template"){
        await createEmailTemplate({
          organizer_id:state.session.user.id,name:data.get("name"),
          subject:data.get("subject"),html_body:data.get("html_body"),
        });
        await loadDashboard();
        showNotice("Email template saved.");
        return;
      }
      if(intent==="preview"){
        const result=await communicationsAction("preview",common);
        form.querySelector("#audience-preview").innerHTML=`<b>${result.count} recipients</b>${result.sample?.length ? `<span>${result.sample.map(escapeHtml).join(", ")}</span>` : ""}`;
        return;
      }
      if(intent==="test"){
        await communicationsAction("test",common);
        showNotice("Test email sent to your account.");
        return;
      }
      if(intent==="send" && !confirm("Send this campaign now to the selected audience?")) return;
      await communicationsAction("create",{
        ...common,name:data.get("name"),messageType:data.get("message_type"),
        scheduledAt:data.get("scheduled_at") ? new Date(data.get("scheduled_at")).toISOString() : null,
        sendNow:intent==="send",
      });
      dialog.close();
      await go("dashboard");
      showNotice(intent==="send" ? "Campaign sending started." : data.get("scheduled_at") ? "Campaign scheduled." : "Campaign saved as a draft.");
    }

    if (form.id === "results-form") {
      const results=[...form.querySelectorAll(".result-entry")].map((row)=>({
        registrationId:row.dataset.registrationId,
        chipTimeMs:parseResultTime(row.querySelector('[name="chip_time"]').value),
        gunTimeMs:parseResultTime(row.querySelector('[name="gun_time"]').value),
        status:row.querySelector('[name="result_status"]').value,
        division:row.querySelector('[name="division"]').value || null,
      })).filter((item)=>item.status!=="finisher" || item.chipTimeMs!==null || item.gunTimeMs!==null);
      if(!results.length) throw new Error("Enter at least one finish time or non-finisher status");
      await resultsAction("save_many",{eventId:form.dataset.eventId,results});
      await loadDashboard();
      openDialog(resultsManagerForm(eventById(form.dataset.eventId)));
      showNotice(`${results.length} results saved.`);
    }

    if (form.id === "volunteer-signup-form") {
      const signup=await joinVolunteerShift({
        shiftId:form.dataset.shiftId,firstName:data.get("first_name"),lastName:data.get("last_name"),
        email:data.get("email"),phone:data.get("phone"),emergencyContact:data.get("emergency_contact"),
        notes:data.get("notes"),waiverAccepted:data.get("waiver")==="on",
      });
      dialog.close();
      showNotice(signup.status==="waitlisted" ? "That shift is full, so you joined its waitlist." : "Your volunteer shift is confirmed.");
    }

    if (form.id === "volunteer-role-form") {
      await createVolunteerRole({
        event_id:form.dataset.eventId,name:data.get("name"),description:data.get("description"),
        requirements:data.get("requirements") || "",waiver_text:data.get("waiver_text") || "",
        minimum_age:data.get("minimum_age") ? Number(data.get("minimum_age")) : null,
      },{
        starts_at:new Date(data.get("starts_at")).toISOString(),ends_at:new Date(data.get("ends_at")).toISOString(),
        location:data.get("location"),capacity:Number(data.get("capacity")),instructions:data.get("instructions") || "",
      });
      await loadDashboard();
      openDialog(volunteerManagerForm(eventById(form.dataset.eventId)));
      showNotice("Volunteer role and shift created.");
    }

    if (form.id === "volunteer-roster-form") {
      const updates=[...form.querySelectorAll("[data-volunteer-signup-id]")].map((row)=>{
        const checked=row.querySelector('[name="checked_in"]').checked;
        return updateVolunteerSignup(row.dataset.volunteerSignupId,{
          status:row.querySelector('[name="status"]').value,
          checked_in_at:checked ? new Date().toISOString() : null,
          hours_worked:row.querySelector('[name="hours"]').value==="" ? null : Number(row.querySelector('[name="hours"]').value),
          checked_out_at:row.querySelector('[name="status"]').value==="completed" ? new Date().toISOString() : null,
        });
      });
      await Promise.all(updates);
      await loadDashboard();
      openDialog(volunteerManagerForm(eventById(form.dataset.eventId)));
      showNotice("Volunteer roster updated.");
    }

    if (form.id === "site-branding-form") {
      const changes={
        primary_color:data.get("primary_color"),contact_email:data.get("contact_email") || null,
        website_published:data.get("website_published")==="on",
      };
      const logo=data.get("logo"); const banner=data.get("banner");
      if(logo?.size) changes.logo_url=await uploadEventAsset(state.session.user.id,form.dataset.eventId,logo);
      if(banner?.size) changes.banner_url=await uploadEventAsset(state.session.user.id,form.dataset.eventId,banner);
      await updateEventSettings(form.dataset.eventId,changes);
      await loadDashboard();
      openDialog(siteEditorForm(eventById(form.dataset.eventId)));
      showNotice(changes.website_published ? "Event website published." : "Website draft saved.");
    }

    if (form.id === "site-section-form") {
      const race=eventById(form.dataset.eventId);
      await createEventSection({
        event_id:race.id,section_type:data.get("section_type"),title:data.get("title"),content:data.get("content"),
        link_url:data.get("link_url") || null,link_label:data.get("link_label") || null,
        published:data.get("published")==="on",sort_order:(race.os_event_sections || []).length,
      });
      await loadDashboard();
      openDialog(siteEditorForm(eventById(race.id)));
      showNotice("Website section added.");
    }

    if (form.id === "site-sponsor-form") {
      const logo=data.get("logo");
      const logoUrl=logo?.size ? await uploadEventAsset(state.session.user.id,form.dataset.eventId,logo) : null;
      const race=eventById(form.dataset.eventId);
      await createEventSponsor({
        event_id:race.id,name:data.get("name"),sponsor_level:data.get("sponsor_level") || "Sponsor",
        website_url:data.get("website_url") || null,logo_url:logoUrl,sort_order:(race.os_event_sponsors || []).length,
      });
      await loadDashboard();
      openDialog(siteEditorForm(eventById(race.id)));
      showNotice("Sponsor added.");
    }

    if (form.id === "wave-form") {
      const race=eventById(form.dataset.eventId);
      await createWave({
        event_id:race.id,tier_id:data.get("tier_id"),name:data.get("name"),
        starts_at:new Date(data.get("starts_at")).toISOString(),capacity:Number(data.get("capacity")),
        min_pace_seconds:data.get("min_pace") ? Math.round(parseResultTime(data.get("min_pace"))/1000) : null,
        max_pace_seconds:data.get("max_pace") ? Math.round(parseResultTime(data.get("max_pace"))/1000) : null,
        bib_start:data.get("bib_start") ? Number(data.get("bib_start")) : null,
        bib_end:data.get("bib_end") ? Number(data.get("bib_end")) : null,
        selection_closes_at:data.get("selection_closes_at") ? new Date(data.get("selection_closes_at")).toISOString() : null,
        self_select:data.get("self_select")==="on",sort_order:(race.os_waves || []).length,
      });
      await loadDashboard();
      openDialog(waveManagerForm(eventById(race.id)));
      showNotice("Start wave created.");
    }

    if (form.id === "wave-assignment-form") {
      const ids=[...form.elements.registration_ids.selectedOptions].map((option)=>option.value);
      if(!ids.length) throw new Error("Select at least one participant");
      const result=await wavesAction("assign",{eventId:form.dataset.eventId,waveId:data.get("wave_id"),registrationIds:ids});
      await loadDashboard();
      openDialog(waveManagerForm(eventById(form.dataset.eventId)));
      showNotice(`${result.assigned} runners assigned.`);
    }

    if (form.id === "runner-wave-form") {
      await wavesAction("assign_self",{
        eventId:form.dataset.eventId,registrationId:form.dataset.registrationId,waveId:data.get("wave_id"),
        estimatedPaceSeconds:data.get("estimated_pace") ? Math.round(parseResultTime(data.get("estimated_pace"))/1000) : null,
      });
      dialog.close();
      await go("runner");
      showNotice("Your start wave was updated.");
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
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-field='tier_id']")) {
    const block=event.target.closest(".participant-block");
    const waveSelect=block?.querySelector("[data-field='wave_id']");
    if(waveSelect){
      waveSelect.value="";
      [...waveSelect.options].forEach((option)=>{option.hidden=Boolean(option.dataset.tier && option.dataset.tier!==event.target.value);});
    }
    return;
  }
  if (event.target.id === "results-csv-file" && event.target.files?.[0]) {
    event.target.files[0].text().then((text)=>{
      const textarea=document.querySelector("#results-csv");
      if(textarea) textarea.value=text;
    });
    return;
  }
  if (event.target.name !== "template_id") return;
  const template=state.emailTemplates.find((item)=>item.id===event.target.value);
  if (!template) return;
  const form=event.target.closest("form");
  form.elements.subject.value=template.subject;
  form.elements.html_body.value=template.html_body;
});
document.addEventListener("input", (event) => {
  if (event.target.matches("[data-help-search]")) {
    const search = event.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-help-filter]").forEach((button) => button.classList.toggle("active", button.dataset.helpFilter === "All"));
    document.querySelectorAll("[data-help-article]").forEach((article) => {
      article.classList.toggle("hidden", Boolean(search && !article.dataset.helpSearchable.includes(search)));
    });
    const visible = document.querySelectorAll("[data-help-article]:not(.hidden)").length;
    document.querySelector(".help-count").textContent = `${visible} guide${visible === 1 ? "" : "s"}`;
    return;
  }
  if(!event.target.matches("[data-results-search],[data-results-tier]")) return;
  const search=(document.querySelector("[data-results-search]")?.value || "").trim().toLowerCase();
  const tier=document.querySelector("[data-results-tier]")?.value || "";
  document.querySelectorAll(".result-row").forEach((row)=>{
    row.classList.toggle("hidden",Boolean(search && !row.dataset.resultSearch.includes(search)) || Boolean(tier && row.dataset.resultTier!==tier));
  });
});
document.addEventListener("dragstart",(event)=>{
  const row=event.target.closest("[data-site-section-id]");
  if(!row) return;
  draggedSectionId=row.dataset.siteSectionId;
  row.classList.add("dragging");
});
document.addEventListener("dragend",(event)=>{
  event.target.closest("[data-site-section-id]")?.classList.remove("dragging");
  draggedSectionId=null;
});
document.addEventListener("dragover",(event)=>{
  const row=event.target.closest("[data-site-section-id]");
  if(!row || !draggedSectionId || row.dataset.siteSectionId===draggedSectionId) return;
  event.preventDefault();
  const dragged=document.querySelector(`[data-site-section-id="${draggedSectionId}"]`);
  const box=row.getBoundingClientRect();
  row.parentElement.insertBefore(dragged,event.clientY < box.top+box.height/2 ? row : row.nextSibling);
});
document.addEventListener("drop",async(event)=>{
  const list=event.target.closest("#site-section-list");
  if(!list || !draggedSectionId) return;
  event.preventDefault();
  const ids=[...list.querySelectorAll("[data-site-section-id]")].map((row)=>row.dataset.siteSectionId);
  const race=state.events.find((item)=>item.os_event_sections?.some((section)=>ids.includes(section.id)));
  if(!race) return;
  await updateEventSections(ids.map((id,sort_order)=>({...race.os_event_sections.find((section)=>section.id===id),sort_order})));
  await loadDashboard();
  openDialog(siteEditorForm(eventById(race.id)));
  showNotice("Section order saved.");
});
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  showNotice(event.reason?.message || "Something went wrong.");
});
authButton.addEventListener("click", () => {
  state.pendingView="runner";
  configured ? openDialog(authForm()) : showNotice("Add Supabase credentials in config.js to enable accounts.");
});
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
  if (params.get("series")) {
    const series=state.series.find((item)=>item.id===params.get("series"));
    if(series) await renderSeries(series);
  } else if (params.get("results")) {
    const race=eventById(params.get("results"));
    if(race?.results_published_at) renderResults(race);
  } else if (params.get("unsubscribe") && params.get("token")) {
    await communicationsAction("unsubscribe",{email:params.get("unsubscribe"),token:params.get("token")});
    showNotice("You have been unsubscribed from OpenStart marketing emails.");
    history.replaceState({}, "", location.pathname);
  } else if (params.get("payment") === "success") {
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
