import {
  configured, displayDate, escapeHtml, eventDay, eventMonth, money, slugify, supabase,
} from "./core.js?v=36";
import {
  accountAction, addSeriesEvent, beginRegistration, beginStripeOnboarding, createChecklistItem, createEvent, createEventQuestion, createSeries,
  communicationsAction, createEmailTemplate, createEventSection, createEventSponsor, createEventTier, createManualRegistration, createProduct, createPromoCode, createScheduledPrice, createShowcaseEvent, createVolunteerRole, createWave,
  deleteChecklistItem, deleteEventQuestion, deleteEventSection, deleteEventSponsor, deleteScheduledPrice, deleteShowcaseEvent, deleteWave, DEMO_ORGANIZER_ID, duplicateEvent, removeSeriesEvent,
  getAthleteProfile, getMyAthleteProfile, getOrganizerProfile, getPublishedEvent, listAuditLog, listCaptainTeams, listEmailTemplates, listMyLotteryApplications, listOrganizerCampaigns, listOrganizerEvents, listOrganizerOrderItems, listOrganizerSeries, listPublishedEvents, listPublishedSeries, listRegistrations, organizerEventMetrics,
  eventReadiness, listMyVolunteerSignups, listRunnerRegistrations, lotteryAction, publishEvent, raceDayAction, registrationAction, resendConfirmation, resetDemo, resultsAction, unpublishEvent, updateEventSettings,
  platformAdminAction, reviewLotteryApplication, saveAthleteProfile, seriesAction, submitLotteryApplication, updateChecklistItem, updateEventSections, updateOrderItem, updateRegistration, updateSeries, updateVolunteerSignup, updateWaitlist, withdrawLotteryApplication, joinVolunteerShift, uploadEventAsset, wavesAction,
} from "./data.js?v=36";
import { createRegistrationController } from "./features/registration/controller.js?v=48";
import { createRegistrationViews } from "./features/registration/views.js?v=68";
import { createOrganizerController } from "./features/organizer/controller.js?v=57";
import { createPlatformController } from "./features/platform/controller.js?v=49";
import { createSeriesController } from "./features/series/controller.js?v=50";
import { createSeriesViews } from "./features/series/views.js?v=63";
import { createLotteryController } from "./features/lottery/controller.js?v=51";
import { createLotteryViews } from "./features/lottery/views.js?v=66";
import { createCommunicationsController } from "./features/communications/controller.js?v=52";
import { createCommunicationsViews } from "./features/communications/views.js?v=62";
import { createResultsController } from "./features/results/controller.js?v=53";
import { createResultsViews } from "./features/results/views.js?v=59";
import { createVolunteersController } from "./features/volunteers/controller.js?v=54";
import { createVolunteerViews } from "./features/volunteers/views.js?v=60";
import { createRaceDayController } from "./features/race-day/controller.js?v=55";
import { createRaceDayViews } from "./features/race-day/views.js?v=61";
import { createEventCommerceController } from "./features/event-commerce/controller.js?v=56";
import { createEventCommerceViews } from "./features/event-commerce/views.js?v=65";
import { createEventSiteController } from "./features/event-site/controller.js?v=57";
import { createEventSiteViews } from "./features/event-site/views.js?v=67";
import { createWavesController } from "./features/waves/controller.js?v=57";
import { createWaveViews } from "./features/waves/views.js?v=64";
import { createAppState, eventById as findEventById, eventRegistrations as findEventRegistrations, tierById as findTierById } from "./modules/app-state.js?v=40";
import { demoView, helpView } from "./modules/content-views.js?v=40";
import { parseRegion, proximityRank, raceTypeFor, regionLabel, stateFromCoords } from "./modules/discovery.js?v=40";
import { createDispatcher, handlersFrom } from "./modules/dispatcher.js?v=46";
import { createBusyController } from "./modules/busy.js?v=48";
import { parseResultsCsv as parseResultRows } from "./modules/results.js?v=43";
import { createRouter } from "./modules/router.js?v=43";
import { createDialogController, createNoticeController } from "./modules/ui-feedback.js?v=47";
import { contentHtml, localDateTime, ordinal, parseResultTime, resultTime, safeColor, safeUrl, setPageMetadata } from "./modules/ui.js?v=40";

const page = document.querySelector("#page-content");
const dialog = document.querySelector("#app-dialog");
const dialogContent = document.querySelector("#dialog-content");
const notice = document.querySelector("#notice");
const authButton = document.querySelector("#auth-button");
const signOutButton = document.querySelector("#sign-out");
const setupBanner = document.querySelector("#setup-banner");
const platformNav = document.querySelector("#platform-nav");
let draggedSectionId=null;

const state = createAppState();

const eventById = (id) => findEventById(state,id);

// Discovery loads a light card-only record per event. Anything that renders an
// event's detail must first pull the full record (questions, products, waves,
// volunteer roles, site sections, sponsors, results) and cache it back into
// state.events, so later lookups through eventById see the complete object.
const hydrateEvent = async (id) => {
  const existing = eventById(id);
  if (!id || existing?.detailLoaded) return existing;
  try {
    const full = await getPublishedEvent(id);
    if (!full) return existing;
    full.detailLoaded = true;
    const index = state.events.findIndex((event) => event.id === id);
    if (index >= 0) state.events[index] = full; else state.events.push(full);
    return full;
  } catch (error) {
    showNotice(error.message, { type: "error", duration: 0 });
    return existing;
  }
};
const tierById = findTierById;
const eventRegistrations = (id) => findEventRegistrations(state,id);

function renderHelp() {
  setPageMetadata(
    "OpenStart Help — Guides for runners and organizers",
    "Learn how to register, manage races, accept test payments, communicate with participants, and run race day in OpenStart.",
  );
  page.innerHTML = helpView();
}

function renderArchitecture() {
  setPageMetadata(
    "OpenStart Architecture — Platform overview",
    "A concise guide to OpenStart's system design, core domains, trust boundaries, and critical workflows.",
  );
  page.innerHTML = `
    <article class="architecture-page">
      <header class="architecture-hero">
        <button class="back-button" data-view="help" type="button">← Back to Help</button>
        <p class="eyebrow">OPENSTART ARCHITECTURE · JULY 2026</p>
        <h1>A simple platform for a complicated race day.</h1>
        <p>OpenStart keeps the browser lightweight and puts durable records, permissions, capacity, and money decisions behind server-controlled boundaries. This paper is a practical map of the system, not an exhaustive specification.</p>
        <div class="architecture-facts">
          <span><b>Static web app</b>Fast, portable client</span>
          <span><b>Postgres core</b>One source of truth</span>
          <span><b>Edge functions</b>Trusted integrations</span>
          <span><b>Open source</b>Auditable by design</span>
        </div>
      </header>
      <nav class="architecture-toc" aria-label="Architecture paper sections">
        <a href="#system-map">System map</a><a href="#domains">Core domains</a><a href="#flows">Critical flows</a><a href="#trust">Trust &amp; reliability</a><a href="#deployment">Deployment</a>
      </nav>
      <div class="architecture-body">
        <section class="paper-section paper-intro">
          <div><p class="section-number">01</p><h2>Design in one sentence</h2></div>
          <p>OpenStart is a browser-delivered race-management application backed by Supabase: the client handles presentation and workflow, Postgres owns durable state and invariants, and Edge Functions mediate operations that require secrets or external providers.</p>
        </section>
        <section class="paper-section" id="system-map">
          <div><p class="section-number">02</p><h2>System map</h2><p class="section-lede">Four user groups share one application surface, while policy and provider boundaries stay on the server.</p></div>
          <figure class="system-diagram" aria-labelledby="system-map-caption">
            <div class="diagram-users"><span>Runners</span><span>Organizers</span><span>Race-day staff</span><span>Platform operators</span></div>
            <div class="diagram-connector" aria-hidden="true"><i></i><b>HTTPS</b><i></i></div>
            <div class="diagram-client"><small>CLIENT</small><strong>OpenStart web application</strong><span>Discovery · Registration · Organizer workspace · Race-day tools</span></div>
            <div class="diagram-connector" aria-hidden="true"><i></i><b>Supabase SDK / API</b><i></i></div>
            <div class="diagram-platform">
              <div><small>IDENTITY</small><strong>Supabase Auth</strong><span>Sessions and verified accounts</span></div>
              <div class="diagram-core"><small>SYSTEM OF RECORD</small><strong>Postgres + RLS</strong><span>Events, people, orders, results, audit history</span></div>
              <div><small>TRUSTED COMPUTE</small><strong>Edge Functions</strong><span>Payments, email, admin, race operations</span></div>
            </div>
            <div class="diagram-connector" aria-hidden="true"><i></i><b>Verified provider APIs</b><i></i></div>
            <div class="diagram-providers"><span><b>Stripe</b>Checkout &amp; payouts</span><span><b>Resend</b>Transactional &amp; campaign email</span></div>
            <figcaption id="system-map-caption">The client never receives provider secrets. Row Level Security and server functions enforce access at the data boundary.</figcaption>
          </figure>
        </section>
        <section class="paper-section" id="domains">
          <div><p class="section-number">03</p><h2>Core domains</h2><p class="section-lede">The product is broad, but its capabilities group into six understandable areas.</p></div>
          <div class="domain-grid">
            <article><span>01</span><h3>Event publishing</h3><p>Drafts, guided setup, branded event sites, readiness checks, schedules, tiers, waves, and race series.</p></article>
            <article><span>02</span><h3>Registration</h3><p>Participants, questions, waivers, teams, lotteries, waitlists, transfers, promo codes, and capacity.</p></article>
            <article><span>03</span><h3>Commerce</h3><p>Stripe Checkout, connected organizer payouts, application fees, merchandise, donations, and reconciliation.</p></article>
            <article><span>04</span><h3>Race operations</h3><p>Staff access, QR passes, packet pickup, check-in, bib assignment, walk-ups, volunteers, and fulfillment.</p></article>
            <article><span>05</span><h3>Results &amp; community</h3><p>Timing imports, official results, leaderboards, athlete profiles, series points, and team standings.</p></article>
            <article><span>06</span><h3>Platform operations</h3><p>Health signals, audit logs, payment and email failures, fees, support notes, and event suspension.</p></article>
          </div>
        </section>
        <section class="paper-section" id="flows">
          <div><p class="section-number">04</p><h2>Critical flows</h2><p class="section-lede">Two workflows show the main architectural rule: the browser initiates; the server decides.</p></div>
          <div class="flow-grid">
            <figure class="flow-card"><figcaption><span>PAYMENT FLOW</span><strong>A registration becomes confirmed only after provider verification.</strong></figcaption><ol>
              <li><b>1</b><span><strong>Reserve</strong>The database atomically checks eligibility and capacity.</span></li>
              <li><b>2</b><span><strong>Checkout</strong>An Edge Function creates an idempotent Stripe session.</span></li>
              <li><b>3</b><span><strong>Verify</strong>A signed webhook reports the payment outcome.</span></li>
              <li><b>4</b><span><strong>Confirm</strong>The server records payment, registration, and receipt state.</span></li>
            </ol></figure>
            <figure class="flow-card"><figcaption><span>RACE-DAY FLOW</span><strong>Every scan resolves against current, authorized records.</strong></figcaption><ol>
              <li><b>1</b><span><strong>Assign</strong>An organizer grants a scoped staff role to a verified email.</span></li>
              <li><b>2</b><span><strong>Present</strong>The runner shows a signed QR pass or provides identifying details.</span></li>
              <li><b>3</b><span><strong>Validate</strong>The race-day function checks role, event, and participant state.</span></li>
              <li><b>4</b><span><strong>Record</strong>Pickup, bib, check-in, and fulfillment changes are auditable.</span></li>
            </ol></figure>
          </div>
        </section>
        <section class="paper-section" id="trust">
          <div><p class="section-number">05</p><h2>Trust, privacy &amp; reliability</h2></div>
          <div class="principle-list">
            <article><h3>Server-authoritative invariants</h3><p>Database constraints and functions protect capacity, unique active registrations, publishing readiness, lottery finality, and financial settings—even if a client is stale or modified.</p></article>
            <article><h3>Least-privilege access</h3><p>Row Level Security scopes records to public visitors, account owners, event staff, organizers, and platform operators. Hiding a control in the interface is never treated as authorization.</p></article>
            <article><h3>Idempotent external work</h3><p>Payment sessions, webhooks, campaigns, and background claims are designed to tolerate retries without duplicate charges or sends. Provider events and operational actions remain traceable.</p></article>
            <article><h3>Fast public, bounded private</h3><p>Discovery uses a purpose-built, paged read model. Organizer metrics use counters and summaries; worker claims use bounded batches so platform growth does not turn every screen into a full-table scan.</p></article>
          </div>
        </section>
        <section class="paper-section" id="deployment">
          <div><p class="section-number">06</p><h2>Deployment model</h2></div>
          <div class="deployment-strip" aria-label="Deployment sequence">
            <span><b>Static assets</b>HTML, CSS, JavaScript, manifest</span><i>→</i><span><b>Supabase project</b>Auth, Postgres, storage, functions</span><i>→</i><span><b>Providers</b>Stripe and Resend credentials</span><i>→</i><span><b>Operations</b>Migrations, monitoring, reconciliation</span>
          </div>
          <div class="paper-note"><b>Why this shape?</b><p>The static client is inexpensive to host and easy to inspect. Native ES modules separate state, content, discovery, shared presentation, and workflow composition without adding a build system. Postgres centralizes consistency, while Edge Functions keep secrets and privileged workflows out of the browser.</p></div>
        </section>
        <section class="paper-close"><p class="eyebrow">THE OPERATING IDEA</p><blockquote>Keep the experience welcoming. Keep the important decisions verifiable.</blockquote><button class="subtle-button" data-view="help" type="button">Return to Help</button></section>
      </div>
    </article>`;
}

function renderDemo() {
  setPageMetadata("OpenStart Demo — Explore every race-management feature","Tour OpenStart features or create a private sample event with realistic demonstration data.");
  page.innerHTML = demoView(state);
}

const setupSteps = ["Basics","Registration options","Runner experience","Website","Optional tools","Review & publish"];

function localReadiness(event) {
  const paid=(event.os_event_tiers || []).some((tier)=>tier.price_cents>0);
  return {ready:false,items:[
    {key:"basics",label:"Event details",required:true,complete:Boolean(event.name && event.description?.length>=10 && event.location_name),detail:"Add a name, location, and useful description."},
    {key:"schedule",label:"Future event date",required:true,complete:new Date(event.starts_at)>new Date(),detail:"Choose a future date."},
    {key:"tiers",label:"Registration option",required:true,complete:Boolean(event.os_event_tiers?.length),detail:"Add at least one distance."},
    {key:"payments",label:"Payment account",required:paid,complete:!paid,detail:"Paid registration requires Stripe."},
  ]};
}

async function renderSetupWizard(event,step=0) {
  state.setupEventId=event.id;
  const readiness=configured ? await eventReadiness(event.id) : localReadiness(event);
  const completed=readiness.items.filter((item)=>item.complete).length;
  const content=[
    `<form id="setup-basics-form" data-event-id="${event.id}" data-next-step="1">
      <label>Event name<input name="name" value="${escapeHtml(event.name)}" required minlength="3" maxlength="120"></label>
      <div class="split-fields"><label>Date and time<input name="starts_at" type="datetime-local" value="${localDateTime(event.starts_at)}" required></label><label>Location<input name="location_name" value="${escapeHtml(event.location_name)}" required></label></div>
      <label>Description<textarea name="description" rows="6" required minlength="10">${escapeHtml(event.description)}</textarea></label>
      <button class="primary-button" type="submit">Save and continue</button>
    </form>`,
    `<div class="setup-tier-summary">${event.os_event_tiers.map((tier)=>`<article><span><b>${escapeHtml(tier.name)}</b><small>${escapeHtml(tier.distance_label)}</small></span><span><b>${money(tier.price_cents)}</b><small>${tier.capacity} spots</small></span></article>`).join("")}</div>
    <form id="setup-tier-form" data-event-id="${event.id}">
      <h3>Add another registration option</h3>
      <div class="split-fields"><label>Name<input name="name" placeholder="Half Marathon" required></label><label>Distance<input name="distance_label" placeholder="13.1 miles" required></label></div>
      <div class="split-fields"><label>Price<input name="price" type="number" min="0" step=".01" required></label><label>Capacity<input name="capacity" type="number" min="1" required></label></div>
      <div class="dialog-actions"><button class="subtle-button" type="submit">Add option</button><button class="primary-button" data-setup-step="2" data-setup-event="${event.id}" type="button">Continue</button></div>
    </form>`,
    `<form id="setup-runner-form" data-event-id="${event.id}" data-next-step="3">
      <label>Participant waiver <span class="optional-label">Strongly recommended</span><textarea name="waiver_text" rows="7" placeholder="Enter the agreement participants must accept">${escapeHtml(event.waiver_text || "")}</textarea></label>
      <div class="split-fields"><label>Participant edits close<input name="participant_edits_close_at" type="datetime-local" value="${localDateTime(event.participant_edits_close_at)}"></label><label>Transfers close<input name="transfers_close_at" type="datetime-local" value="${localDateTime(event.transfers_close_at)}"></label></div>
      <div class="setup-inline-actions"><button class="subtle-button" data-registration-settings="${event.id}" type="button">Manage custom questions</button><span>${event.os_event_questions?.length || 0} questions configured</span></div>
      <button class="primary-button" type="submit">Save and continue</button>
    </form>`,
    `<form id="setup-website-form" data-event-id="${event.id}" data-next-step="4">
      <div class="split-fields"><label>Brand color<input name="primary_color" type="color" value="${safeColor(event.primary_color)}"></label><label>Public contact email<input name="contact_email" type="email" value="${escapeHtml(event.contact_email || state.session?.user?.email || "")}"></label></div>
      <label class="check-label"><input name="website_published" type="checkbox" ${event.website_published ? "checked" : ""}> Publish custom website sections when the event goes live</label>
      <div class="setup-inline-actions"><button class="subtle-button" data-site-editor="${event.id}" type="button">Edit page sections and sponsors</button><span>${event.os_event_sections?.length || 0} sections configured</span></div>
      <button class="primary-button" type="submit">Save and continue</button>
    </form>`,
    `<div class="setup-option-grid">
      <article><h3>Pricing & promotions</h3><p>Scheduled prices, promo codes, and capacity.</p><button class="subtle-button" data-pricing-settings="${event.id}" type="button">Configure</button></article>
      <article><h3>Merchandise & donations</h3><p>Products, inventory, fundraising, and fulfillment.</p><button class="subtle-button" data-product-settings="${event.id}" type="button">Configure</button></article>
      <article><h3>Lottery</h3><p>Applications, qualification rules, and available spots.</p><button class="subtle-button" data-lottery-manager="${event.id}" type="button">Configure</button></article>
      <article><h3>Waves & corrals</h3><p>Start times, pace ranges, capacity, and bib ranges.</p><button class="subtle-button" data-wave-manager="${event.id}" type="button">Configure</button></article>
      <article><h3>Volunteers</h3><p>Roles, shifts, requirements, and capacity.</p><button class="subtle-button" data-volunteer-manager="${event.id}" type="button">Configure</button></article>
      <article><h3>Readiness checklist</h3><p>Permits, course planning, communications, and race day.</p><button class="subtle-button" data-checklist="${event.id}" type="button">Open checklist</button></article>
    </div><button class="primary-button" data-setup-step="5" data-setup-event="${event.id}" type="button">Continue to review</button>`,
    `<div class="setup-review">
      <div class="setup-readiness">${readiness.items.map((item)=>`<article class="${item.complete ? "complete" : item.required ? "required" : ""}"><i>${item.complete ? "✓" : item.required ? "!" : "○"}</i><span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.detail)}${item.required ? " · Required" : " · Optional"}</small></span></article>`).join("")}</div>
      <aside><p class="eyebrow">${event.status==="published" ? "EVENT IS LIVE" : readiness.ready ? "READY TO PUBLISH" : "SETUP INCOMPLETE"}</p><h3>${event.status==="published" ? "Registration is public." : readiness.ready ? "Everything required is ready." : "Finish the required items first."}</h3><p>You can preview at any time. Publishing makes the event discoverable and opens eligible registration or lottery applications.</p>
      <button class="subtle-button" data-setup-preview="${event.id}" type="button">Preview event page</button>
      ${event.status==="published" ? `<button class="danger-button" data-unpublish-event="${event.id}" type="button">Return to draft</button>` : `<button class="primary-button" data-publish-event="${event.id}" type="button" ${readiness.ready ? "" : "disabled"}>Publish event</button>`}</aside>
    </div>`,
  ][step];
  setPageMetadata(`${event.name} setup — OpenStart`,"Guided event setup and publishing.");
  page.innerHTML=`<section class="setup-wizard">
    <header><button class="back-button" data-exit-setup type="button">← Organizer</button><p class="eyebrow">GUIDED EVENT SETUP</p><h1>${escapeHtml(event.name)}</h1><div><span><b>${completed}/${readiness.items.length}</b> readiness items</span><span><b>${event.status}</b> visibility</span></div></header>
    <nav class="setup-steps" aria-label="Event setup steps">${setupSteps.map((label,index)=>`<button class="${index===step ? "active" : ""}" data-setup-step="${index}" data-setup-event="${event.id}" type="button"><i>${index+1}</i><span>${label}</span></button>`).join("")}</nav>
    <div class="setup-content"><div><p class="eyebrow">STEP ${step+1} OF ${setupSteps.length}</p><h2>${setupSteps[step]}</h2></div>${content}</div>
  </section>`;
  syncNavigation();
  scrollTo(0,0);
}
const effectivePrice = (tier) => {
  const now = Date.now();
  const active = (tier.os_tier_prices || []).filter((price) => new Date(price.starts_at).getTime() <= now)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return active[0]?.price_cents ?? tier.price_cents;
};
const noticeController = createNoticeController({ notice });
const dialogController = createDialogController({ dialog, content: dialogContent, onClose: stopScanner });
function showNotice(message, options) { noticeController.show(message, options); }

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
  platformNav.classList.toggle("hidden", !state.platformAdmin?.allowed);
}

async function loadPlatformAccess(){
  state.platformAdmin=state.session ? await platformAdminAction("access").catch(()=>({allowed:false})) : null;
  syncNavigation();
}

async function loadPlatformOverview(query=""){
  state.platformData=await platformAdminAction("overview",{query});
}

function platformSuspensionForm(event){
  return `<section class="modal"><div class="form-heading"><div><p>Platform safety control</p><h2>Suspend ${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <p>Suspension removes the event from public discovery and blocks new registrations. Existing financial records remain intact.</p>
    <form id="platform-suspend-form" data-event-id="${event.id}"><label>Internal reason<textarea name="reason" minlength="4" maxlength="500" required></textarea></label><button class="danger-button" type="submit">Suspend event</button></form></section>`;
}

function platformFeeForm(event){
  return `<section class="modal"><div class="form-heading"><div><p>Financial control</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="platform-event-fee-form" data-event-id="${event.id}"><label>Platform fee percentage<input name="fee_percent" type="number" min="0" max="25" step=".01" value="${event.platform_fee_bps/100}" required></label><button class="primary-button" type="submit">Save event fee</button></form></section>`;
}

function platformNoteForm({eventId="",organizerId="",label=""}){
  return `<section class="modal"><div class="form-heading"><div><p>Private support history</p><h2>Add note</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div><p>${escapeHtml(label)}</p>
    <form id="platform-note-form"><input type="hidden" name="event_id" value="${eventId}"><input type="hidden" name="organizer_id" value="${organizerId}"><label>Internal note<textarea name="note" minlength="2" maxlength="2000" required></textarea></label><button class="primary-button" type="submit">Save note</button></form></section>`;
}

function renderPlatformAdmin(){
  const data=state.platformData;
  if(!data) return;
  const m=data.metrics;
  const ownerById=(id)=>data.organizers.find((item)=>item.id===id);
  setPageMetadata("OpenStart Platform Operations","Private operational controls for OpenStart.");
  page.innerHTML=`<section class="platform-console">
    <div class="dashboard-header"><div><p class="eyebrow">PRIVATE OPERATOR CONSOLE</p><h1>Platform operations</h1><p>Payments, organizers, delivery health, and safety controls in one place.</p></div><span class="operator-role">${escapeHtml(data.role)} access</span></div>
    <div class="metric-grid platform-metrics">
      <div><span>Gross processed</span><strong>${money(m.grossCents)}</strong><small>${money(m.feeCents)} platform fees</small></div>
      <div><span>Organizers</span><strong>${m.organizers}</strong><small>${m.activeEvents} active events</small></div>
      <div><span>Reconciliation</span><strong class="${m.reconciliationAlerts+m.counterDrift ? "health-bad" : "health-ok"}">${m.reconciliationAlerts+m.counterDrift}</strong><small>${m.counterDrift} capacity drift · ${m.reconciliationAlerts} payment alerts</small></div>
      <div><span>Operational failures</span><strong class="${m.failedDeliveries+m.failedProviderEvents ? "health-bad" : "health-ok"}">${m.failedDeliveries+m.failedProviderEvents}</strong><small>email + provider events</small></div>
    </div>
    <div class="platform-toolbar">
      <form id="platform-search-form"><label>Search organizers and events<input name="query" type="search" placeholder="Name or account email"></label><button class="subtle-button" type="submit">Search</button></form>
      <form id="platform-default-fee-form"><label>Default fee (%)<input name="fee_percent" type="number" min="0" max="25" step=".01" value="${data.settings.default_platform_fee_bps/100}" required></label><button class="subtle-button" type="submit">Update default</button></form>
    </div>
    <div class="dashboard-card"><div class="card-heading"><div><h2>Reconciliation alerts</h2><p>Paid records without provider references, confirmed unpaid entries, and stale pending checkouts.</p></div></div>
      <div class="operations-list">${data.reconciliation.map((item)=>`<article><div><b>${escapeHtml(item.event_name)}</b><small>${escapeHtml(item.payment_status)} · ${escapeHtml(item.status)} · ${new Date(item.created_at).toLocaleString()}</small></div><span>${money(item.amount_cents)}<code>${escapeHtml(item.id.slice(0,8))}</code></span></article>`).join("") || '<div class="empty-state">No payment mismatches detected.</div>'}</div>
    </div>
    <div class="dashboard-card"><div class="card-heading"><div><h2>Events</h2><p>Cross-platform status, fees, and emergency controls.</p></div></div>
      <div class="operations-list">${data.events.map((event)=>{const owner=ownerById(event.organizer_id);return `<article class="${event.platform_suspended_at ? "operation-suspended" : ""}"><div><b>${escapeHtml(event.name)}</b><small>${escapeHtml(owner?.email || "Unknown organizer")} · ${escapeHtml(event.status)} · ${(event.platform_fee_bps/100).toFixed(2)}% fee</small>${event.platform_suspension_reason ? `<em>${escapeHtml(event.platform_suspension_reason)}</em>` : ""}</div><span><button class="text-button" data-platform-event-fee="${event.id}" type="button">Fee</button><button class="text-button" data-platform-event-note="${event.id}" type="button">Note</button>${event.platform_suspended_at ? `<button class="subtle-button" data-platform-restore="${event.id}" type="button">Restore</button>` : `<button class="danger-button" data-platform-suspend="${event.id}" type="button">Suspend</button>`}</span></article>`;}).join("") || '<div class="empty-state">No matching events.</div>'}</div>
    </div>
    <div class="dashboard-card"><div class="card-heading"><div><h2>Organizers</h2><p>Stripe readiness and account activity.</p></div></div>
      <div class="operations-list">${data.organizers.map((item)=>`<article><div><b>${escapeHtml(item.display_name || item.email)}</b><small>${escapeHtml(item.email)} · ${item.event_count} event${item.event_count===1?"":"s"} · Last sign-in ${item.last_sign_in_at ? new Date(item.last_sign_in_at).toLocaleDateString() : "never"}</small></div><span><b class="${item.stripe_charges_enabled && item.stripe_payouts_enabled ? "health-ok" : "health-bad"}">${item.stripe_charges_enabled && item.stripe_payouts_enabled ? "Stripe ready" : "Stripe incomplete"}</b><button class="text-button" data-platform-organizer-note="${item.id}" type="button">Note</button></span></article>`).join("") || '<div class="empty-state">No matching organizers.</div>'}</div>
    </div>
    <div class="platform-columns">
      <div class="dashboard-card"><div class="card-heading"><div><h2>Provider events</h2><p>Latest Stripe webhook processing.</p></div></div><div class="operations-list compact">${data.providerEvents.slice(0,25).map((item)=>`<article><div><b>${escapeHtml(item.event_type)}</b><small>${new Date(item.received_at).toLocaleString()}</small></div><span class="${item.status==="failed"?"health-bad":"health-ok"}">${escapeHtml(item.status)}</span></article>`).join("") || '<div class="empty-state">No provider events recorded yet.</div>'}</div></div>
      <div class="dashboard-card"><div class="card-heading"><div><h2>Email failures</h2><p>Bounces, complaints, and failed sends.</p></div></div><div class="operations-list compact">${data.failedDeliveries.slice(0,25).map((item)=>`<article><div><b>${escapeHtml(item.email)}</b><small>${escapeHtml(item.error_message || "No provider detail")}</small></div><span class="health-bad">${escapeHtml(item.status)}</span></article>`).join("") || '<div class="empty-state">No email failures recorded.</div>'}</div></div>
    </div>
    <div class="dashboard-card"><div class="card-heading"><div><h2>Support notes</h2><p>Private operator context and intervention history.</p></div></div><div class="audit-list">${data.notes.slice(0,30).map((item)=>`<p><span><b>${escapeHtml(item.body)}</b><small>${new Date(item.created_at).toLocaleString()}</small></span><code>${item.event_id ? "event" : "organizer"}</code></p>`).join("") || '<div class="empty-state">No support notes yet.</div>'}</div></div>
  </section>`;
}

const DISCOVER_PAGE_SIZE = 12;

const discoverEvents = () => {
  return state.events.filter((event)=>event.status==="published");
};

const discoverCountLabel = () => {
  const total = state.discoverTotal;
  const filtered = state.discoverQuery || (state.discoverRegion && state.discoverRegion.state);
  return `${total} ${total === 1 ? "event" : "events"}${filtered ? " found" : " open"}`;
};

const discoverResults = () => {
  const matching = discoverEvents();
  const visible = matching;
  const region = state.discoverRegion;
  const nearby = Boolean(region && region.state);
  const noneNearby = nearby && !matching.some((event) => proximityRank(event, region) < 2);
  return `
    ${noneNearby ? `<p class="discover-empty">No events near ${escapeHtml(regionLabel(region))} yet — showing the soonest events everywhere.</p>` : ""}
    <div class="event-grid">${visible.map(publicEventCard).join("")}</div>
    ${state.discoverTotal > visible.length
      ? `<div class="discover-more"><button class="subtle-button" data-show-more type="button">Show more events (${state.discoverTotal-visible.length} remaining)</button></div>` : ""}
    ${state.discoverTotal === 0 ? `<p class="discover-empty">No events match that search.</p>` : ""}`;
};

// Repaint only the results so typing never steals focus from the search field.
const refreshDiscover = () => {
  const results = document.querySelector("#discover-results");
  if (!results) return;
  results.innerHTML = discoverResults();
  const count = document.querySelector("#discover-count");
  if (count) count.textContent = discoverCountLabel();
};

const loadDiscovery = async () => {
  const request=++state.discoverRequest;
  const result=await listPublishedEvents({
    query:state.discoverQuery,region:state.discoverRegion,limit:state.discoverVisible,offset:0,
  });
  if(request!==state.discoverRequest) return false;
  if(Array.isArray(result)){
    state.events=result;
    state.discoverTotal=result.length;
  }else{
    state.events=result.events;
    state.discoverTotal=result.total;
  }
  return true;
};

const setDiscoverRegion = async (region) => {
  state.discoverRegion = region;
  state.discoverVisible = DISCOVER_PAGE_SIZE;
  try {
    if (region) localStorage.setItem("openstart-region", JSON.stringify(region));
    else localStorage.removeItem("openstart-region");
  } catch { /* private browsing — the region simply will not persist */ }
  await loadDiscovery();
  renderDiscover();
};

try {
  const savedRegion = JSON.parse(localStorage.getItem("openstart-region") || "null");
  if (savedRegion && savedRegion.state) state.discoverRegion = savedRegion;
} catch { /* ignore unreadable storage */ }

function publicEventCard(event, index) {
  const tiers = event.os_event_tiers || [];
  const raceType = raceTypeFor(tiers);
  return `
    <article class="event-card event-tone-${index % 3}" style="--event-accent:${safeColor(event.primary_color)}">
      <div class="event-date"><span>${eventMonth(event.starts_at)}</span><strong>${eventDay(event.starts_at)}</strong></div>
      <div class="event-card-content">
        <div class="event-card-kicker"><p>${escapeHtml(event.location_name)}</p><span class="race-type race-type-${raceType.kind}" title="${raceType.kind} race">${raceType.label}</span></div>
        <h3>${escapeHtml(event.name)}</h3>
        <div class="tier-pills">${tiers.map((tier) => `<span>${escapeHtml(tier.distance_label)}</span>`).join("")}</div>
        <button data-event-id="${event.id}" type="button">View event <span>→</span></button>
      </div>
    </article>`;
}

function renderDiscover() {
  setPageMetadata();
  const published = state.events.filter((event) => event.status === "published");
  const matching = discoverEvents();
  const visible = matching;
  const nearby = Boolean(state.discoverRegion && state.discoverRegion.state);
  page.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Registration without the runaround</p>
        <h1>Great race days start in the open.</h1>
        <p class="hero-lede">Discover local events and register in minutes. OpenStart gives organizers a transparent, community-owned alternative for managing every starting line.</p>
        <div class="hero-actions"><a class="primary-button" href="#events">Explore events</a><button class="text-button" data-go-dashboard type="button">I organize races →</button></div>
      </div>
      <div class="hero-photo">
        <img src="assets/openstart-race-hero.png" width="1536" height="1024" alt="A community road race beginning at sunrise">
        <div class="hero-photo-shade"></div>
        <div class="route-line"><span>START</span><i></i><span>FINISH</span></div>
        <div class="hero-photo-caption"><p>Up next</p><strong>${escapeHtml(published[0]?.name || "Your next race")}</strong></div>
        <div class="hero-meta"><span><b>${state.discoverTotal}</b> events</span><span><b>${published.reduce((sum, event) => sum + event.os_event_tiers.length, 0)}</b> visible distances</span><span><b>${published.length ? money(Math.min(...published.flatMap((event) => event.os_event_tiers.map(effectivePrice)))) : "—"}</b> from</span></div>
      </div>
    </section>
    <section class="events-section" id="events">
      <div class="section-heading"><div><p class="eyebrow">On the calendar</p><h2>Find your next starting line</h2></div><span id="discover-count">${discoverCountLabel()}</span></div>
      <div class="discover-controls">
        <input id="discover-search" type="search" placeholder="Search races or places" value="${escapeHtml(state.discoverQuery)}" aria-label="Search events by name or location">
        <div class="discover-location">
          ${nearby
            ? `<span class="location-chip">Near ${escapeHtml(regionLabel(state.discoverRegion))}<button data-clear-location type="button" aria-label="Clear location">×</button></span>`
            : `<button class="subtle-button" data-use-location type="button">Use my location</button>
               <input id="discover-place" placeholder="or enter a city or state" aria-label="Enter your city or state">`}
        </div>
      </div>
      <div id="discover-results">${discoverResults()}</div>
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
  const lottery = event.registration_mode === "lottery";
  const lotteryOpen = lottery &&
    (!event.lottery_opens_at || new Date(event.lottery_opens_at) <= new Date()) &&
    (!event.lottery_closes_at || new Date(event.lottery_closes_at) >= new Date());
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
          <h2>${lottery ? "Lottery race options" : "Choose your event"}</h2>
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
          ${lottery ? `
            <p>${lotteryOpen ? "Lottery applications are open" : "Lottery application period"}</p>
            <h2>${lotteryOpen ? "Enter the lottery" : "Applications are closed"}</h2>
            <span>${event.lottery_spots ? `${event.lottery_spots} available spots. ` : ""}${event.qualifier_required ? "A qualifying result is required. " : ""}${event.lottery_closes_at ? `Applications close ${displayDate(event.lottery_closes_at)}.` : ""}</span>
            ${lotteryOpen ? `<button class="primary-button" data-apply-lottery="${event.id}" type="button">Apply to lottery</button>` : ""}
          ` : event.registration_mode === "closed" ? `
            <p>Registration</p><h2>Registration is closed</h2><span>Check back for updates from the organizer.</span>
          ` : `
            <p>Registration is open</p><h2>Claim your spot</h2>
            <span>Complete registration and use Stripe Checkout for paid entries.</span>
            <button class="primary-button" data-register="${event.id}" type="button">Register now</button>
          `}
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
  const realEvents = state.events.filter((event) => !event.is_showcase);
  const realEventIds = new Set(realEvents.map((event) => event.id));
  const published = realEvents.filter((event) => event.status === "published");
  const metrics=state.organizerMetrics.filter((item)=>realEventIds.has(item.event_id));
  const metricByEvent=(id)=>metrics.find((item)=>item.event_id===id) || {};
  const confirmedCount=metrics.reduce((sum,item)=>sum+Number(item.confirmed_count || 0),0);
  const gross=metrics.reduce((sum,item)=>sum+Number(item.gross_cents || 0),0);
  const discounts=metrics.reduce((sum,item)=>sum+Number(item.discount_cents || 0),0);
  const platformFees=metrics.reduce((sum,item)=>sum+Number(item.platform_fee_cents || 0),0);
  const merchandiseRevenue=metrics.reduce((sum,item)=>sum+Number(item.merchandise_cents || 0),0);
  const donationRevenue=metrics.reduce((sum,item)=>sum+Number(item.donation_cents || 0),0);
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
        <div><p>Confirmed registrations</p><strong>${confirmedCount}</strong><span>Across all events</span></div>
        <div><p>Published events</p><strong>${published.length}</strong><span>${realEvents.length - published.length} draft</span></div>
        <div><p>Confirmed registration value</p><strong>${money(gross)}</strong><span>Paid and free confirmed entries</span></div>
        <div><p>Estimated organizer net</p><strong>${money(gross - platformFees)}</strong><span>${money(discounts)} discounts · before Stripe fees</span></div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Your events</h2><p>Manage details and monitor signups.</p></div>${configured ? "" : '<button class="subtle-button" data-reset-demo type="button">Reset demo</button>'}</div>
        <div class="event-table">
          <div class="table-header"><span>Event</span><span>Status</span><span>Registrations</span><span>Date</span></div>
          ${realEvents.map((event) => `
            <button class="table-row" data-roster="${event.id}" type="button">
              <span><b>${escapeHtml(event.name)}</b><small>${event.status === "draft" ? "Continue guided setup" : escapeHtml(event.location_name)} · ${event.os_event_checklist_items?.filter((item) => item.completed_at).length || 0}/${event.os_event_checklist_items?.length || 0} tasks done</small></span>
              <span><i class="status-dot ${event.status}"></i>${event.status}</span>
              <span>${Number(metricByEvent(event.id).confirmed_count || 0)}</span>
              <span>${displayDate(event.starts_at)} <b>›</b></span>
            </button>`).join("")}
        </div>
      </div>
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Financial overview</h2><p>Confirmed registration revenue and OpenStart application fees.</p></div><button class="subtle-button" data-export-finance type="button">Export financial CSV</button></div>
        <div class="revenue-categories"><span><b>${money(gross)}</b>Registrations</span><span><b>${money(merchandiseRevenue)}</b>Merchandise</span><span><b>${money(donationRevenue)}</b>Donations</span></div>
        <div class="finance-grid">${realEvents.map((event) => {
          const eventMetric=metricByEvent(event.id);
          const revenue=Number(eventMetric.gross_cents || 0);
          const fees=Number(eventMetric.platform_fee_cents || 0);
          return `<div><span>${escapeHtml(event.name)}</span><b>${money(revenue)}</b><small>${Number(eventMetric.confirmed_count || 0)} entries · ${money(revenue-fees)} estimated net</small></div>`;
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

const lotteryViews = createLotteryViews({ effectivePrice, safeUrl, tierById });
const lotteryRunnerCard = lotteryViews.runnerCard;
const lotteryApplicationForm = lotteryViews.application;
const lotteryCheckoutForm = lotteryViews.checkout;
const lotteryLifecycleForm = lotteryViews.lifecycle;

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
      ${state.lotteryApplications.length ? `<div class="captain-dashboard"><div class="card-heading"><div><h2>My lottery applications</h2><p>Qualification review, draw results, waitlist position, and payment deadlines.</p></div></div>${state.lotteryApplications.map(lotteryRunnerCard).join("")}</div>` : ""}
      ${state.volunteerSignups.length ? `<div class="captain-dashboard"><div class="card-heading"><div><h2>My volunteer shifts</h2><p>Upcoming assignments and service history.</p></div></div>${state.volunteerSignups.map((signup)=>{const shift=signup.os_volunteer_shifts;const role=shift?.os_volunteer_roles;return `<article><h3>${escapeHtml(role?.name || "Volunteer")} <small>${escapeHtml(role?.os_events?.name || "")}</small></h3><p><span>${new Date(shift.starts_at).toLocaleString()} · ${escapeHtml(shift.location)}</span><b>${escapeHtml(signup.status)}</b></p>${signup.hours_worked!==null ? `<p><span>Recorded service</span><b>${signup.hours_worked} hours</b></p>` : ""}</article>`;}).join("")}</div>` : ""}
      ${state.captainTeams.length ? `<div class="captain-dashboard"><div class="card-heading"><div><h2>Teams I captain</h2><p>Member status and relay assignments.</p></div></div>${state.captainTeams.map((team) => `<article><h3>${escapeHtml(team.name)} <small>${escapeHtml(team.category)} · ${escapeHtml(team.os_events?.name || "")}</small></h3>${(team.os_registrations || []).map((member) => `<p><span>${escapeHtml(member.first_name)} ${escapeHtml(member.last_name)}${member.relay_leg ? ` · ${escapeHtml(member.relay_leg)}` : ""}</span><b>${escapeHtml(member.status)}</b></p>`).join("")}</article>`).join("")}</div>` : ""}
      <div class="athlete-cta-card"><div><h2>Athlete profile</h2><p>${state.athleteProfile ? `Your public race history lives at <code>?athlete=${escapeHtml(state.athleteProfile.handle)}</code>${state.athleteProfile.is_public ? "" : " — currently private"}.` : "Create a shareable page that gathers your published results and personal bests across every OpenStart event."}</p></div><span>${state.athleteProfile && state.athleteProfile.is_public ? `<button class="subtle-button" data-view-athlete="${escapeHtml(state.athleteProfile.handle)}" type="button">View public page</button>` : ""}<button class="primary-button" data-edit-athlete type="button">${state.athleteProfile ? "Edit profile" : "Create profile"}</button></span></div>
      <div class="privacy-card"><div><h2>Your data</h2><p>Download a portable copy of your OpenStart information or permanently delete a runner-only account.</p></div><span><button class="subtle-button" data-export-account type="button">Export my data</button><button class="danger-button" data-delete-account type="button">Delete account</button></span></div>
    </section>`;
}

function athletePrs(results){
  const best=new Map();
  for(const row of results){
    if(row.status!=="finisher") continue;
    const milliseconds=row.chip_time_ms ?? row.gun_time_ms;
    if(milliseconds==null) continue;
    const key=row.distance_label || row.tier_name || "Result";
    const current=best.get(key);
    if(!current || milliseconds<current.milliseconds) best.set(key,{milliseconds,event:row.event_name,when:row.starts_at});
  }
  return [...best.entries()].map(([label,info])=>({label,...info}));
}

function renderAthlete(data){
  state.view="athlete";
  state.selectedEvent=null;
  const {profile,results}=data;
  const finishes=results.filter((row)=>row.status==="finisher");
  const prs=athletePrs(results);
  const name=profile.display_name || `@${profile.handle}`;
  setPageMetadata(`${name} · OpenStart athlete`,`Race history and personal bests for ${name} on OpenStart.`);
  page.innerHTML=`
    <section class="athlete-page">
      <div class="athlete-header">
        <button class="text-button" data-back type="button">← OpenStart</button>
        <div class="athlete-identity">
          <span class="athlete-avatar" aria-hidden="true">${escapeHtml((profile.display_name || profile.handle).slice(0,1).toUpperCase())}</span>
          <div>
            <p class="eyebrow">Athlete</p>
            <h1>${escapeHtml(name)}</h1>
            <p class="athlete-meta">@${escapeHtml(profile.handle)}${profile.location ? ` · ${escapeHtml(profile.location)}` : ""}</p>
          </div>
        </div>
        ${profile.bio ? `<p class="athlete-bio">${contentHtml(profile.bio)}</p>` : ""}
      </div>
      <div class="metric-grid">
        <div><p>Races</p><strong>${results.length}</strong><span>Published results</span></div>
        <div><p>Finishes</p><strong>${finishes.length}</strong><span>Official finisher results</span></div>
        <div><p>Distances</p><strong>${prs.length}</strong><span>Personal bests below</span></div>
      </div>
      ${prs.length ? `<div class="dashboard-card"><div class="card-heading"><div><h2>Personal bests</h2><p>Fastest published finish per distance.</p></div></div>
        <div class="athlete-pr-grid">${prs.map((pr)=>`<article><b>${resultTime(pr.milliseconds)}</b><span>${escapeHtml(pr.label)}</span><small>${escapeHtml(pr.event)} · ${displayDate(pr.when)}</small></article>`).join("")}</div></div>` : ""}
      <div class="dashboard-card">
        <div class="card-heading"><div><h2>Race history</h2><p>Every published result, newest first.</p></div></div>
        <div class="athlete-results">
          ${results.length ? results.map((row)=>{
            const milliseconds=row.chip_time_ms ?? row.gun_time_ms;
            const place=row.status==="finisher" && row.overall_place ? `${row.overall_place} / ${row.tier_finishers}` : "—";
            const division=row.status==="finisher" && row.division_place && row.division ? `${ordinal(row.division_place)} ${escapeHtml(row.division)}` : "";
            return `<article class="athlete-result">
              <div class="athlete-result-main">
                <p>${displayDate(row.starts_at)} · ${escapeHtml(row.location_name || "")}</p>
                <h3>${escapeHtml(row.event_name)}</h3>
                <small>${escapeHtml(row.tier_name)}${row.distance_label ? ` · ${escapeHtml(row.distance_label)}` : ""}</small>
              </div>
              <div class="athlete-result-time">
                <b>${row.status==="finisher" ? resultTime(milliseconds) : row.status.toUpperCase()}</b>
                <span>${place}${division ? ` · ${division}` : ""}</span>
              </div>
            </article>`;
          }).join("") : '<div class="empty-state">No published results yet.</div>'}
        </div>
      </div>
    </section>`;
  syncNavigation();
  page.focus({preventScroll:true});
}

function athleteProfileForm(profile){
  const current=profile || {};
  return `<section class="modal"><div class="form-heading"><div><p>Runner profile</p><h2>${profile ? "Edit" : "Create"} your athlete page</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <form id="athlete-profile-form">
      <label>Public handle<input name="handle" value="${escapeHtml(current.handle || "")}" pattern="[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])" minlength="3" maxlength="32" placeholder="jane-runner" required ${profile ? "readonly" : ""}></label>
      <p class="form-hint">Lowercase letters, numbers, and hyphens. Your page lives at <code>?athlete=your-handle</code>.${profile ? " Handles can't be changed once set." : ""}</p>
      <label>Display name<input name="display_name" value="${escapeHtml(current.display_name || "")}" maxlength="80" placeholder="Jane Runner"></label>
      <label>Location<input name="location" value="${escapeHtml(current.location || "")}" maxlength="80" placeholder="Boulder, CO"></label>
      <label>Short bio<textarea name="bio" maxlength="400" placeholder="Trail runner chasing a half-marathon PR.">${escapeHtml(current.bio || "")}</textarea></label>
      <label class="checkbox-row"><input type="checkbox" name="is_public" ${current.is_public===false ? "" : "checked"}> Make my profile and results public</label>
      <p class="form-message"></p>
      <button class="primary-button" type="submit">${profile ? "Save profile" : "Create profile"}</button>
    </form></section>`;
}

function embedSnippetForm(event){
  const scriptSrc=new URL("embed.js",document.baseURI).href;
  const snippet=`<div data-openstart-embed="${event.slug}"></div>\n<script src="${scriptSrc}"></script>`;
  const preview=new URL("embed.html",document.baseURI);
  preview.searchParams.set("event",event.slug);
  return `<section class="modal"><div class="form-heading"><div><p>Embed registration</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <p class="form-hint">Paste this where you want a registration widget to appear on your own website. Checkout runs securely on OpenStart — no extra configuration required.</p>
    <label>Embed code<textarea id="embed-snippet" rows="3" readonly>${escapeHtml(snippet)}</textarea></label>
    <div class="card-actions"><button class="primary-button" data-copy-embed type="button">Copy code</button><a class="subtle-button" href="${escapeHtml(preview.href)}" target="_blank" rel="noopener">Preview widget</a></div>
    <p class="form-hint">Optional: add <code>data-openstart-accent="#0f6b4f"</code> to the div to match your brand colour.</p>
  </section>`;
}

function renderRoster(event) {
  const registrations = eventRegistrations(event.id);
  document.querySelector("#roster-slot").innerHTML = `
    <div class="dashboard-card roster-card">
      <div class="card-heading"><div><h2>${escapeHtml(event.name)} registrations</h2><p>Manage participants, volunteers, start groups, race-day details, and results.</p></div><div class="card-actions"><button class="subtle-button" data-open-setup="${event.id}" type="button">Setup guide</button><button class="subtle-button" data-lottery-manager="${event.id}" type="button">Lottery</button><button class="subtle-button" data-checklist="${event.id}" type="button">Checklist</button><button class="subtle-button" data-duplicate-event="${event.id}" type="button">Duplicate</button><button class="subtle-button" data-site-editor="${event.id}" type="button">Website</button><button class="subtle-button" data-wave-manager="${event.id}" type="button">Waves</button><button class="subtle-button" data-volunteer-manager="${event.id}" type="button">Volunteers</button><button class="subtle-button" data-results-manager="${event.id}" type="button">Results</button><button class="subtle-button" data-embed-code="${event.id}" type="button">Embed</button><button class="subtle-button" data-close-roster type="button">Close</button></div></div>
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
        <label>Email<input name="email" type="email" autocomplete="email" autofocus required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
        <button class="primary-button" name="intent" value="signin" type="submit">Sign in</button>
        <button class="subtle-button" name="intent" value="signup" type="submit">Create account</button>
        <p class="form-message" aria-live="polite"></p>
      </form>
    </section>`;
}

const registrationViews = createRegistrationViews({
  effectivePrice,
  getLocation: () => location,
  getSessionEmail: () => state.session?.user?.email,
});
const participantFields = registrationViews.participantFields;
const registrationForm = registrationViews.registration;
const manualRegistrationForm = registrationViews.manual;
const editRegistrationForm = registrationViews.edit;
const runnerRegistrationForm = registrationViews.runner;
const acceptTransferForm = registrationViews.transfer;

const eventCommerceViews = createEventCommerceViews({ effectivePrice });
const registrationSettingsForm = eventCommerceViews.registrationSettings;
const pricingSettingsForm = eventCommerceViews.pricingSettings;
const productSettingsForm = eventCommerceViews.productSettings;

const eventSiteViews = createEventSiteViews();
const siteEditorForm = eventSiteViews.editor;

const waveViews = createWaveViews({ eventRegistrations, tierById, resultTime });
const waveManagerForm = waveViews.manager;
const runnerWaveForm = waveViews.runner;

const volunteerViews = createVolunteerViews({ getSessionEmail: () => state.session?.user?.email });
const volunteerOpportunitiesForm = volunteerViews.opportunities;
const volunteerSignupForm = volunteerViews.signup;
const volunteerManagerForm = volunteerViews.manager;

function exportVolunteers(event) {
  const rows=[["role","shift_start","shift_end","location","first_name","last_name","email","phone","emergency_contact","status","checked_in","hours"]];
  for(const role of event.os_volunteer_roles || []) for(const shift of role.os_volunteer_shifts || []) for(const signup of shift.os_volunteer_signups || []) rows.push([
    role.name,shift.starts_at,shift.ends_at,shift.location,signup.first_name,signup.last_name,signup.email,signup.phone,signup.emergency_contact,signup.status,signup.checked_in_at || "",signup.hours_worked ?? "",
  ]);
  const csv=rows.map((row)=>row.map((value)=>`"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  const link=document.createElement("a"); link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); link.download=`${event.slug}-volunteers.csv`; link.click(); URL.revokeObjectURL(link.href);
}

const resultsViews = createResultsViews({ page, eventRegistrations, tierById });
const renderResults = resultsViews.renderPage;
const resultsManagerForm = resultsViews.manager;

const seriesViews = createSeriesViews({
  getEvents: () => state.events,
  getSeries: () => state.series,
});
const seriesManagerForm = seriesViews.manager;
const seriesSettingsForm = seriesViews.settings;

function parseResultsCsv(text,event) {
  return parseResultRows(text, eventRegistrations(event.id), parseResultTime);
}

const communicationsViews = createCommunicationsViews({
  getEvents: () => state.events,
  getEmailTemplates: () => state.emailTemplates,
});
const campaignForm = communicationsViews.campaign;

const raceDayViews = createRaceDayViews({ eventRegistrations });
const raceDayForm = raceDayViews.manager;
const raceDayResults = raceDayViews.results;
const passForm = raceDayViews.pass;

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
        <p class="modal-note">OpenStart creates a private draft, then guides you through registration, payments, website content, optional tools, and a final readiness review.</p>
        <button class="primary-button" type="submit">Create draft & continue</button>
      </form>
    </section>`;
}

function duplicateEventForm(event) {
  const suggestedDate = new Date(new Date(event.starts_at).setFullYear(new Date(event.starts_at).getFullYear() + 1)).toISOString().slice(0,10);
  return `<section class="modal"><div class="form-heading"><div><p>Reusable event</p><h2>Duplicate ${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <p class="modal-note">Creates a private draft with registration options, questions, waiver, website content, sponsors, products, and shifted registration deadlines. Participants, payments, results, and staff are never copied.</p>
    <form id="duplicate-event-form" data-source-event-id="${event.id}">
      <label>New event name<input name="name" value="${escapeHtml(event.name)}" required minlength="3" maxlength="120"></label>
      <label>New event date<input name="date" type="date" value="${suggestedDate}" required></label>
      <button class="primary-button" type="submit">Create draft copy</button>
    </form></section>`;
}

function checklistForm(event) {
  const items = [...(event.os_event_checklist_items || [])].sort((a,b) =>
    Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)) ||
    new Date(a.due_at || "9999-12-31") - new Date(b.due_at || "9999-12-31") ||
    a.sort_order - b.sort_order
  );
  const complete = items.filter((item) => item.completed_at).length;
  const percent = items.length ? Math.round(complete / items.length * 100) : 0;
  return `<section class="modal wide-modal"><div class="form-heading"><div><p>Operational readiness</p><h2>${escapeHtml(event.name)}</h2></div><button data-close-dialog aria-label="Close" type="button">×</button></div>
    <div class="checklist-progress"><span><b>${complete} of ${items.length}</b> tasks complete</span><strong>${percent}% ready</strong><i><em style="width:${percent}%"></em></i></div>
    <div class="checklist-list">${items.map((item) => {
      const overdue = !item.completed_at && item.due_at && new Date(item.due_at) < new Date();
      return `<article class="${item.completed_at ? "complete" : ""}">
        <button class="checklist-toggle" data-toggle-checklist="${item.id}" data-event="${event.id}" data-complete="${item.completed_at ? "true" : "false"}" type="button" aria-label="${item.completed_at ? "Mark incomplete" : "Mark complete"}">${item.completed_at ? "✓" : ""}</button>
        <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.category.replaceAll("_"," "))}${item.due_at ? ` · <time class="${overdue ? "overdue" : ""}">${overdue ? "Overdue · " : ""}${displayDate(item.due_at)}</time>` : " · No due date"}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</small></span>
        <button class="icon-button" data-delete-checklist="${item.id}" data-event="${event.id}" type="button" aria-label="Delete ${escapeHtml(item.title)}">×</button>
      </article>`;
    }).join("") || '<div class="empty-state">No checklist tasks yet.</div>'}</div>
    <h3>Add a task</h3>
    <form id="checklist-item-form" data-event-id="${event.id}">
      <label>Task<input name="title" placeholder="Confirm medical team" required maxlength="180"></label>
      <div class="split-fields"><label>Category<select name="category"><option value="planning">Planning</option><option value="registration">Registration</option><option value="course">Course</option><option value="volunteers">Volunteers</option><option value="communications">Communications</option><option value="race_day">Race day</option><option value="post_event">Post-event</option><option value="operations">Other operations</option></select></label><label>Due date<input name="due_at" type="date"></label></div>
      <label>Notes<input name="notes" placeholder="Optional owner, vendor, or detail"></label>
      <button class="primary-button" type="submit">Add task</button>
    </form></section>`;
}

function openDialog(content) {
  dialogController.open(content);
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
  const [discovery,series] = await Promise.all([
    listPublishedEvents({query:state.discoverQuery,region:state.discoverRegion,limit:state.discoverVisible,offset:0}),
    listPublishedSeries(),
  ]);
  if(Array.isArray(discovery)){
    state.events=discovery;
    state.discoverTotal=discovery.length;
  }else{
    state.events=discovery.events;
    state.discoverTotal=discovery.total;
  }
  state.series=series;
  state.registrations = configured ? [] : await listRegistrations(state.events.map((event) => event.id));
}

async function loadDashboard() {
  const userId = state.session?.user?.id || DEMO_ORGANIZER_ID;
  [state.events, state.profile, state.organizerMetrics] = await Promise.all([
    listOrganizerEvents(userId),
    getOrganizerProfile(userId),
    organizerEventMetrics(),
  ]);
  state.series=await listOrganizerSeries(userId);
  const loadedIds=[...state.loadedRegistrationEvents].filter((id)=>state.events.some((event)=>event.id===id));
  state.registrations=loadedIds.length ? await listRegistrations(loadedIds) : [];
  state.orderItems=[];
  [state.campaigns,state.emailTemplates,state.auditLog] = await Promise.all([
    listOrganizerCampaigns(state.events.map((event) => event.id)),
    listEmailTemplates(userId),
    listAuditLog(state.events.map((event)=>event.id)),
  ]);
}

async function ensureEventRegistrations(eventId,force=false){
  if(!eventId || (!force && state.loadedRegistrationEvents.has(eventId))) return;
  const rows=await listRegistrations([eventId]);
  state.registrations=state.registrations.filter((item)=>item.event_id!==eventId).concat(rows);
  state.loadedRegistrationEvents.add(eventId);
}

async function loadRunnerDashboard() {
  [state.runnerRegistrations, state.captainTeams, state.volunteerSignups, state.lotteryApplications, state.athleteProfile] = await Promise.all([
    listRunnerRegistrations(),
    listCaptainTeams(state.session.user.id),
    listMyVolunteerSignups(),
    listMyLotteryApplications(),
    getMyAthleteProfile(),
  ]);
}

const { navigate: go } = createRouter({
  state,
  configured,
  onAuthRequired: () => openDialog(authForm()),
  routes: {
    dashboard: async () => {
      await loadDashboard();
      return () => renderDashboard();
    },
    runner: async () => {
      await loadRunnerDashboard();
      return () => {
        renderRunnerDashboard();
        if (state.pendingTransfer) openDialog(acceptTransferForm(state.pendingTransfer));
      };
    },
    platform: async ({ navigate }) => {
      if (!state.platformAdmin?.allowed) await loadPlatformAccess();
      if (!state.platformAdmin?.allowed) {
        showNotice("Platform operator access is required.");
        await navigate("discover");
        return;
      }
      await loadPlatformOverview();
      return () => renderPlatformAdmin();
    },
    help: async () => () => renderHelp(),
    architecture: async () => () => renderArchitecture(),
    demo: async () => {
      if (state.session) await loadDashboard();
      else await loadPublic();
      return () => renderDemo();
    },
    discover: async () => {
      await loadPublic();
      return () => renderDiscover();
    },
  },
  afterNavigate: () => {
    syncNavigation();
    page.focus({ preventScroll: true });
  },
});

const registrationController = createRegistrationController({
  state,
  eventById,
  openDialog,
  participantFields,
  showNotice,
  withdrawLotteryApplication,
  registrationAction,
  resendConfirmation,
  beginRegistration,
  submitLotteryApplication,
  lotteryAction,
  createManualRegistration,
  updateRegistration,
  parseResultTime,
  loadPublic,
  hydrateEvent,
  renderEvent,
  loadDashboard,
  renderDashboard,
  renderRoster,
  loadRunnerDashboard,
  go,
  dialog,
  forms: {
    auth: authForm,
    editRegistration: editRegistrationForm,
    lotteryApplication: lotteryApplicationForm,
    lotteryCheckout: lotteryCheckoutForm,
    registration: registrationForm,
    runnerRegistration: runnerRegistrationForm,
  },
});

const organizerController = createOrganizerController({
  state,
  eventById,
  openDialog,
  renderSetupWizard,
  renderDashboard,
  renderRoster,
  renderEvent,
  loadDashboard,
  publishEvent,
  unpublishEvent,
  updateChecklistItem,
  deleteChecklistItem,
  deleteScheduledPrice,
  createEvent,
  duplicateEvent,
  createChecklistItem,
  createEventTier,
  updateEventSettings,
  slugify,
  organizerId: () => state.session?.user?.id || DEMO_ORGANIZER_ID,
  dialog,
  showNotice,
  go,
  forms: {
    checklist: checklistForm,
    duplicateEvent: duplicateEventForm,
    event: eventForm,
    manualRegistration: manualRegistrationForm,
    pricingSettings: pricingSettingsForm,
    productSettings: productSettingsForm,
    registrationSettings: registrationSettingsForm,
    siteEditor: siteEditorForm,
    volunteerManager: volunteerManagerForm,
    waveManager: waveManagerForm,
  },
});

const platformController = createPlatformController({
  state,
  openDialog,
  platformAdminAction,
  loadPlatformOverview,
  renderPlatformAdmin,
  dialog,
  showNotice,
  forms: {
    suspension: platformSuspensionForm,
    fee: platformFeeForm,
    note: platformNoteForm,
  },
});

const seriesController = createSeriesController({
  state,
  openDialog,
  renderSeries,
  exportStandings: exportSeriesStandings,
  createSeries,
  updateSeries,
  addSeriesEvent,
  removeSeriesEvent,
  loadDashboard,
  slugify,
  dialog,
  showNotice,
  replaceUrl: (seriesId) => history.replaceState({}, "", `${location.pathname}?series=${seriesId}`),
  scrollToTop: () => scrollTo(0, 0),
  forms: {
    manager: seriesManagerForm,
    settings: seriesSettingsForm,
  },
});

const lotteryController = createLotteryController({
  state,
  eventById,
  openDialog,
  lifecycleForm: lotteryLifecycleForm,
  lotteryAction,
  updateEventSettings,
  reviewLotteryApplication,
  loadDashboard,
  showNotice,
  confirmDraw: () => confirm("Finalize this lottery draw? The weighted result and waitlist order cannot be rerun or edited."),
});

const communicationsController = createCommunicationsController({
  state,
  openDialog,
  campaignForm,
  communicationsAction,
  createEmailTemplate,
  loadDashboard,
  showNotice,
  escapeHtml,
  dialog,
  go,
  confirmSend: () => confirm("Send this campaign now to the selected audience?"),
});

const resultsController = createResultsController({
  eventById,
  openDialog,
  managerForm: resultsManagerForm,
  renderResults,
  parseResultsCsv,
  parseResultTime,
  resultsAction,
  loadDashboard,
  showNotice,
  documentRoot: document,
});

const volunteersController = createVolunteersController({
  eventById,
  openDialog,
  exportVolunteers,
  joinVolunteerShift,
  createVolunteerRole,
  updateVolunteerSignup,
  loadDashboard,
  dialog,
  showNotice,
  forms: {
    opportunities: volunteerOpportunitiesForm,
    signup: volunteerSignupForm,
    manager: volunteerManagerForm,
  },
});

const raceDayController = createRaceDayController({
  state,
  eventById,
  openDialog,
  raceDayAction,
  updateOrderItem,
  startQrScanner,
  exportRoster,
  raceDayResults,
  loadDashboard,
  showNotice,
  loadAndExportFinancials: async () => {
    const eventIds = state.events.filter((item) => !item.is_showcase).map((item) => item.id);
    [state.registrations, state.orderItems] = await Promise.all([
      listRegistrations(eventIds),
      listOrganizerOrderItems(eventIds),
    ]);
    eventIds.forEach((id) => state.loadedRegistrationEvents.add(id));
    exportFinancials();
  },
  forms: {
    manager: raceDayForm,
    pass: passForm,
  },
});

const eventCommerceController = createEventCommerceController({
  eventById,
  openDialog,
  updateEventSettings,
  createEventQuestion,
  deleteEventQuestion,
  createScheduledPrice,
  createPromoCode,
  createProduct,
  loadDashboard,
  showNotice,
  forms: {
    registration: registrationSettingsForm,
    pricing: pricingSettingsForm,
    products: productSettingsForm,
  },
});

const eventSiteController = createEventSiteController({
  state,
  eventById,
  openDialog,
  siteEditorForm,
  updateEventSettings,
  createEventSection,
  createEventSponsor,
  deleteEventSection,
  deleteEventSponsor,
  uploadEventAsset,
  loadDashboard,
  dialog,
  renderEvent,
  showNotice,
});

const wavesController = createWavesController({
  state,
  eventById,
  openDialog,
  createWave,
  deleteWave,
  wavesAction,
  parseResultTime,
  loadDashboard,
  dialog,
  go,
  showNotice,
  forms: {
    manager: waveManagerForm,
    runner: runnerWaveForm,
  },
});

const featureControllers = [
  platformController,
  seriesController,
  lotteryController,
  communicationsController,
  resultsController,
  volunteersController,
  raceDayController,
  eventCommerceController,
  eventSiteController,
  wavesController,
  organizerController,
  registrationController,
];
const busyController = createBusyController();
const dispatchFeatureClick = createDispatcher(handlersFrom(featureControllers, "handleClick"));
const dispatchFeatureSubmit = createDispatcher(handlersFrom(featureControllers, "handleSubmit"));
const dispatchFeatureChange = createDispatcher(handlersFrom(featureControllers, "handleChange"));
const dispatchFeatureInput = createDispatcher(handlersFrom(featureControllers, "handleInput"));

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if(["dashboard","demo"].includes(state.view)){
    const eventId=Object.values(target.dataset).find((value)=>eventById(value));
    if(eventId) await ensureEventRegistrations(eventId);
  }
  if (target.matches("[data-view]")) await go(target.dataset.view);
  if (target.matches("[data-show-more]")) {
    state.discoverVisible += DISCOVER_PAGE_SIZE;
    await loadDiscovery();
    refreshDiscover();
  }
  if (target.matches("[data-clear-location]")) await setDiscoverRegion(null);
  if (target.matches("[data-use-location]")) {
    if (!navigator.geolocation) {
      showNotice("This browser cannot share a location. Enter a city instead.");
      return;
    }
    target.disabled = true;
    target.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const code = stateFromCoords(position.coords.latitude, position.coords.longitude);
        if (!code) {
          showNotice("We could not match that location. Enter a city instead.");
          renderDiscover();
          return;
        }
        setDiscoverRegion({ city: "", state: code });
      },
      () => {
        showNotice("Location permission was declined. Enter a city instead.");
        renderDiscover();
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }
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
    if (state.setupEventId) {
      const setupEvent=eventById(state.setupEventId);
      if (setupEvent) {
        await renderSetupWizard(setupEvent,5);
        return;
      }
    }
    history.replaceState({},"",location.pathname);
    await go("discover");
  }
  if (target.matches("[data-go-dashboard]")) await go("dashboard");
  if (target.matches("[data-demo-sign-in]")) {
    state.pendingView = "demo";
    openDialog(authForm());
  }
  if (target.matches("[data-create-showcase]")) {
    target.disabled = true;
    try {
      await createShowcaseEvent();
      await loadDashboard();
      renderDemo();
      showNotice("Your private showcase is ready.");
    } catch (error) {
      showNotice(error.message || "The showcase could not be created.", { type: "error", duration: 0 });
    }
  }
  if (target.dataset.deleteShowcase) {
    if (!confirm("Remove this private showcase and all of its sample data? Your real events will not be affected.")) return;
    await deleteShowcaseEvent(target.dataset.deleteShowcase);
    await loadDashboard();
    renderDemo();
    showNotice("Showcase removed. Your real events were not changed.");
  }
  if (target.dataset.demoRoster) {
    renderDashboard();
    renderRoster(await hydrateEvent(target.dataset.demoRoster));
    scrollTo(0,document.body.scrollHeight);
  }
  if (target.dataset.demoFeature) {
    // These dialogs edit products, waves, volunteer roles, and site sections,
    // none of which the discovery list carries.
    const race=await hydrateEvent(target.dataset.eventIdDemo);
    const launchers={
      roster:()=>{renderDashboard();renderRoster(race);},
      registration:()=>openDialog(registrationSettingsForm(race)),
      website:()=>openDialog(siteEditorForm(race)),
      pricing:()=>openDialog(pricingSettingsForm(race)),
      products:()=>openDialog(productSettingsForm(race)),
      waves:()=>openDialog(waveManagerForm(race)),
      volunteers:()=>openDialog(volunteerManagerForm(race)),
      "race-day":()=>openDialog(raceDayForm(race)),
      results:()=>openDialog(resultsManagerForm(race)),
      lottery:()=>openDialog(lotteryLifecycleForm(race)),
      checklist:()=>openDialog(checklistForm(race)),
    };
    launchers[target.dataset.demoFeature]?.();
  }
  if (target.dataset.eventId) {
    state.selectedEvent = await hydrateEvent(target.dataset.eventId);
    renderEvent(state.selectedEvent);
    scrollTo(0, 0);
  }
  if (await dispatchFeatureClick(target)) return;
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
  if (target.dataset.embedCode) openDialog(embedSnippetForm(eventById(target.dataset.embedCode)));
  if (target.matches("[data-copy-embed]")) {
    const textarea = document.querySelector("#embed-snippet");
    if (textarea) {
      textarea.select();
      navigator.clipboard?.writeText(textarea.value).then(() => showNotice("Embed code copied.")).catch(() => {});
    }
  }
  if (target.matches("[data-connect-stripe]")) {
    target.disabled = true;
    target.textContent = "Opening Stripe…";
    try {
      const url = await beginStripeOnboarding(`${location.origin}${location.pathname}?stripe=return`);
      location.assign(url);
    } catch (error) {
      target.disabled = false;
      showNotice(error.message || "Stripe onboarding could not start.", { type: "error", duration: 0 });
      await go("dashboard");
    }
  }
  if (target.matches("[data-edit-athlete]")) openDialog(athleteProfileForm(state.athleteProfile));
  if (target.dataset.viewAthlete) {
    const athlete = await getAthleteProfile(target.dataset.viewAthlete);
    if (!athlete) { showNotice("That athlete page isn't public yet."); return; }
    history.replaceState({}, "", `${location.pathname}?athlete=${target.dataset.viewAthlete}`);
    renderAthlete(athlete);
    scrollTo(0, 0);
  }
  if (target.matches("[data-close-roster]")) document.querySelector("#roster-slot").innerHTML = "";
  if (target.matches("[data-reset-demo]")) {
    resetDemo();
    await go("dashboard");
    showNotice("Demo data restored.");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset.rosterSearch) filterRoster(event.target.dataset.rosterSearch);
  if (event.target.id === "discover-search") {
    state.discoverQuery = event.target.value;
    state.discoverVisible = DISCOVER_PAGE_SIZE;
    clearTimeout(event.target._openstartSearchTimer);
    event.target._openstartSearchTimer=setTimeout(async()=>{
      await loadDiscovery();
      refreshDiscover();
    },250);
  }
});

// Enter (or blur) on the manual place field resolves a typed city/state.
document.addEventListener("keydown", (event) => {
  if (event.target.id === "discover-place" && event.key === "Enter") {
    event.preventDefault();
    const typed = parseRegion(event.target.value);
    if (!typed.state) {
      showNotice("Enter a city and state, for example \"Boulder, CO\".");
      return;
    }
    setDiscoverRegion(typed);
  }
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
  const releaseBusy = busyController.begin(form, event.submitter);
  if (!releaseBusy) return;
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
      await loadPlatformAccess();
      dialog.close();
      if (state.pendingLotteryEvent) {
        const lotteryEventId = state.pendingLotteryEvent;
        state.pendingLotteryEvent = null;
        await loadPublic();
        state.selectedEvent = await hydrateEvent(lotteryEventId);
        renderEvent(state.selectedEvent);
        syncNavigation();
        openDialog(lotteryApplicationForm(state.selectedEvent));
      } else {
        await go(state.pendingView || "runner");
      }
    }

    if (await dispatchFeatureSubmit(form, data, event.submitter)) return;

    if(form.id==="athlete-profile-form"){
      const payload={
        handle:String(data.get("handle")||"").trim().toLowerCase(),
        display_name:String(data.get("display_name")||"").trim(),
        location:String(data.get("location")||"").trim(),
        bio:String(data.get("bio")||"").trim(),
        is_public:data.get("is_public")==="on",
      };
      try{
        state.athleteProfile=await saveAthleteProfile(payload);
        dialog.close();
        renderRunnerDashboard();
        showNotice("Athlete profile saved.");
      }catch(error){
        form.querySelector(".form-message").textContent=/duplicate|unique/i.test(error.message||"")
          ? "That handle is already taken. Try another."
          : (error.message || "The profile could not be saved.");
      }
      return;
    }

  } catch (error) {
    const message = error.message || "Something went wrong.";
    const formMessage = form.querySelector(".form-message");
    if (formMessage) formMessage.textContent = message;
    showNotice(message, { type: "error", duration: 0 });
  } finally {
    releaseBusy({ keepBusy: form.dataset.keepBusy === "true" });
  }
});

document.addEventListener("change", async (event) => {
  if (await dispatchFeatureChange(event.target)) return;
  if (event.target.matches("[data-field='tier_id']")) {
    const block=event.target.closest(".participant-block");
    const waveSelect=block?.querySelector("[data-field='wave_id']");
    if(waveSelect){
      waveSelect.value="";
      [...waveSelect.options].forEach((option)=>{option.hidden=Boolean(option.dataset.tier && option.dataset.tier!==event.target.value);});
    }
    return;
  }
  if (event.target.name !== "template_id") return;
  const template=state.emailTemplates.find((item)=>item.id===event.target.value);
  if (!template) return;
  const form=event.target.closest("form");
  form.elements.subject.value=template.subject;
  form.elements.html_body.value=template.html_body;
});
document.addEventListener("input", async (event) => {
  if (await dispatchFeatureInput(event.target)) return;
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
  showNotice(event.reason?.message || "Something went wrong.", { type: "error", duration: 0 });
});
authButton.addEventListener("click", () => {
  state.pendingView="runner";
  configured ? openDialog(authForm()) : showNotice("Add Supabase credentials in config.js to enable accounts.");
});
signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  state.session = null;
  state.platformAdmin=null;
  state.registrations=[];
  state.loadedRegistrationEvents.clear();
  await go("discover");
});
async function boot() {
  setupBanner.classList.toggle("hidden", configured);
  if (configured) {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    await loadPlatformAccess();
    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      if(!session){
        state.registrations=[];
        state.loadedRegistrationEvents.clear();
      }
      syncNavigation();
      setTimeout(()=>loadPlatformAccess(),0);
    });
  }
  const params = new URLSearchParams(location.search);
  state.pendingTransfer = params.get("transfer");
  if (state.pendingTransfer) state.pendingView = "runner";
  const requestedView = state.pendingTransfer ? "runner" : params.get("view") || "discover";
  await go(requestedView, { syncUrl: false });
  if (params.get("athlete")) {
    const athlete=await getAthleteProfile(params.get("athlete"));
    if(athlete) renderAthlete(athlete);
    else showNotice("That athlete page isn't public yet.");
  } else if (params.get("series")) {
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
