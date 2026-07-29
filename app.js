import {
  configured, escapeHtml, slugify, supabase,
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
import { createPublicController } from "./features/public/controller.js?v=80";
import { createOrganizerController } from "./features/organizer/controller.js?v=57";
import { createOrganizerViews } from "./features/organizer/views.js?v=78";
import { createPlatformController } from "./features/platform/controller.js?v=49";
import { createPlatformViews } from "./features/platform/views.js?v=69";
import { createSeriesController } from "./features/series/controller.js?v=50";
import { createSeriesViews } from "./features/series/views.js?v=75";
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
import { createAccountViews } from "./modules/account-views.js?v=77";
import { architectureView, demoView, helpView } from "./modules/content-views.js?v=74";
import { parseRegion, stateFromCoords } from "./modules/discovery.js?v=40";
import { createDispatcher, handlersFrom } from "./modules/dispatcher.js?v=46";
import { createBusyController } from "./modules/busy.js?v=48";
import { createPublicViews } from "./modules/public-views.js?v=79";
import { parseResultsCsv as parseResultRows } from "./modules/results.js?v=43";
import { createRouter } from "./modules/router.js?v=43";
import { createDialogController, createNoticeController } from "./modules/ui-feedback.js?v=47";
import { localDateTime, parseResultTime, resultTime, safeUrl, setPageMetadata } from "./modules/ui.js?v=40";

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
  page.innerHTML = architectureView();
}

function renderDemo() {
  setPageMetadata("OpenStart Demo — Explore every race-management feature","Tour OpenStart features or create a private sample event with realistic demonstration data.");
  page.innerHTML = demoView(state);
}

function localReadiness(event) {
  const paid=(event.os_event_tiers || []).some((tier)=>tier.price_cents>0);
  return {ready:false,items:[
    {key:"basics",label:"Event details",required:true,complete:Boolean(event.name && event.description?.length>=10 && event.location_name),detail:"Add a name, location, and useful description."},
    {key:"schedule",label:"Future event date",required:true,complete:new Date(event.starts_at)>new Date(),detail:"Choose a future date."},
    {key:"tiers",label:"Registration option",required:true,complete:Boolean(event.os_event_tiers?.length),detail:"Add at least one distance."},
    {key:"payments",label:"Payment account",required:paid,complete:!paid,detail:"Paid registration requires Stripe."},
  ]};
}

async function renderSetupWizard(event, step = 0) {
  state.setupEventId = event.id;
  const readiness = configured ? await eventReadiness(event.id) : localReadiness(event);
  setPageMetadata(`${event.name} setup — OpenStart`, "Guided event setup and publishing.");
  page.innerHTML = organizerViews.setup(event, step, readiness, state.session?.user?.email || "");
  syncNavigation();
  scrollTo(0, 0);
}

const effectivePrice = (tier) => {
  const now = Date.now();
  const active = (tier.os_tier_prices || []).filter((price) => new Date(price.starts_at).getTime() <= now)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return active[0]?.price_cents ?? tier.price_cents;
};
const publicViews = createPublicViews({ effectivePrice, eventRegistrations, tierById });
const noticeController = createNoticeController({ notice });
const dialogController = createDialogController({ dialog, content: dialogContent, onClose: stopScanner });
function showNotice(message, options) { noticeController.show(message, options); }
const publicController = createPublicController({
  state,
  page,
  publicViews,
  listPublishedEvents,
  setPageMetadata,
  hydrateEvent,
  parseRegion,
  stateFromCoords,
  showNotice,
  scrollToTop: () => scrollTo(0, 0),
});
const { loadDiscovery, renderDiscover, renderEvent } = publicController;
publicController.restoreRegion();

const platformViews = createPlatformViews();
const healthForm = platformViews.health;
const platformSuspensionForm = platformViews.suspension;
const platformFeeForm = platformViews.fee;
const platformNoteForm = platformViews.note;

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

function renderPlatformAdmin() {
  if (!state.platformData) return;
  setPageMetadata("OpenStart Platform Operations", "Private operational controls for OpenStart.");
  page.innerHTML = platformViews.consolePage(state.platformData);
}

async function renderSeries(series) {
  const standings=await seriesAction("standings",{seriesId:series.id});
  state.seriesStandings=standings;
  setPageMetadata(`${series.name} — OpenStart`,series.description,series.banner_url || series.logo_url || "og.png");
  page.innerHTML = seriesViews.publicPage(series, standings);
}

function exportSeriesStandings(series) {
  const rows=[["rank","first_name","last_name","points","events_completed","wins","eligible"],...(state.seriesStandings?.individual || []).map((row)=>[row.rank,row.firstName,row.lastName,row.points,row.eventsCompleted,row.wins,row.eligible])];
  const csv=rows.map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));link.download=`${series.slug}-standings.csv`;link.click();URL.revokeObjectURL(link.href);
}

function renderDashboard() {
  page.innerHTML = organizerViews.dashboard(state, configured, eventById);
}

const lotteryViews = createLotteryViews({ effectivePrice, safeUrl, tierById });
const lotteryRunnerCard = lotteryViews.runnerCard;
const lotteryApplicationForm = lotteryViews.application;
const lotteryCheckoutForm = lotteryViews.checkout;
const lotteryLifecycleForm = lotteryViews.lifecycle;

function renderRunnerDashboard() {
  page.innerHTML = accountViews.runnerDashboard(state);
}

function renderAthlete(data){
  state.view="athlete";
  state.selectedEvent=null;
  const {profile}=data;
  const name=profile.display_name || `@${profile.handle}`;
  setPageMetadata(`${name} · OpenStart athlete`,`Race history and personal bests for ${name} on OpenStart.`);
  page.innerHTML = accountViews.publicAthlete(data);
  syncNavigation();
  page.focus({preventScroll:true});
}

function renderRoster(event) {
  const slot = document.querySelector("#roster-slot");
  slot.innerHTML = organizerViews.roster(event);
  slot.scrollIntoView({ behavior: "smooth" });
}

const accountViews = createAccountViews({ getBaseUri: () => document.baseURI, lotteryRunnerCard });
const authForm = accountViews.auth;
const athleteProfileForm = accountViews.athleteProfile;
const embedSnippetForm = accountViews.embed;

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

const organizerViews = createOrganizerViews({ eventRegistrations, tierById });
const eventForm = organizerViews.event;
const duplicateEventForm = organizerViews.duplicate;
const checklistForm = organizerViews.checklist;

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
  if (target.matches("[data-show-more]")) await publicController.showMore();
  if (target.matches("[data-clear-location]")) await publicController.setRegion(null);
  if (target.matches("[data-use-location]")) await publicController.useLocation(target);
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
    await publicController.openEvent(target.dataset.eventId);
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
    publicController.search(event.target.value);
  }
});

// Enter (or blur) on the manual place field resolves a typed city/state.
document.addEventListener("keydown", (event) => {
  if (event.target.id === "discover-place" && event.key === "Enter") {
    event.preventDefault();
    publicController.resolvePlace(event.target.value);
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
