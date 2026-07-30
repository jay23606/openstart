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
import { createRegistrationController } from "./features/registration/controller.js?v=95";
import { createRegistrationViews } from "./features/registration/views.js?v=68";
import { createContentController } from "./features/content/controller.js?v=83";
import { createDemoController } from "./features/demo/controller.js?v=95";
import { createAccountController } from "./features/account/controller.js?v=92";
import { createPublicController } from "./features/public/controller.js?v=94";
import { createOrganizerController } from "./features/organizer/controller.js?v=95";
import { createOrganizerViews } from "./features/organizer/views.js?v=78";
import { createPlatformController } from "./features/platform/controller.js?v=49";
import { createPlatformViews } from "./features/platform/views.js?v=69";
import { createSeriesController } from "./features/series/controller.js?v=50";
import { createSeriesViews } from "./features/series/views.js?v=75";
import { createLotteryController } from "./features/lottery/controller.js?v=51";
import { createLotteryViews } from "./features/lottery/views.js?v=66";
import { createCommunicationsController } from "./features/communications/controller.js?v=88";
import { createCommunicationsViews } from "./features/communications/views.js?v=62";
import { createResultsController } from "./features/results/controller.js?v=53";
import { createResultsViews } from "./features/results/views.js?v=59";
import { createVolunteersController } from "./features/volunteers/controller.js?v=54";
import { createVolunteerViews } from "./features/volunteers/views.js?v=60";
import { createRaceDayController } from "./features/race-day/controller.js?v=55";
import { createRaceDayViews } from "./features/race-day/views.js?v=61";
import { createEventCommerceController } from "./features/event-commerce/controller.js?v=56";
import { createEventCommerceViews } from "./features/event-commerce/views.js?v=65";
import { createEventSiteController } from "./features/event-site/controller.js?v=89";
import { createEventSiteViews } from "./features/event-site/views.js?v=67";
import { createWavesController } from "./features/waves/controller.js?v=57";
import { createWaveViews } from "./features/waves/views.js?v=64";
import { createAppStore, eventById as findEventById, eventRegistrations as findEventRegistrations, tierById as findTierById } from "./modules/app-state.js?v=91";
import { createAccountViews } from "./modules/account-views.js?v=77";
import { architectureView, demoView, helpView } from "./modules/content-views.js?v=99";
import { parseRegion, stateFromCoords } from "./modules/discovery.js?v=40";
import { createDispatcher, handlersFrom } from "./modules/dispatcher.js?v=46";
import { createBusyController } from "./modules/busy.js?v=48";
import { createPageLifecycle } from "./modules/page-lifecycle.js?v=81";
import { createShellController } from "./modules/shell-controller.js?v=86";
import { mountNavigationComponent } from "./modules/navigation-component.js?v=100";
import { mountDiscoveryResultsComponent } from "./modules/discovery-results-component.js?v=101";
import { createPublicViews } from "./modules/public-views.js?v=79";
import { parseResultsCsv as parseResultRows } from "./modules/results.js?v=43";
import { createRouter } from "./modules/router.js?v=95";
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

const appStore = createAppStore();
const { state } = appStore;

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
    const events = [...state.events];
    const index = events.findIndex((event) => event.id === id);
    if (index >= 0) events[index] = full; else events.push(full);
    appStore.patch({ events }, "events.hydrated");
    return full;
  } catch (error) {
    showNotice(error.message, { type: "error", duration: 0 });
    return existing;
  }
};
const tierById = findTierById;
const eventRegistrations = (id) => findEventRegistrations(state,id);

function renderHelp() {
  pageLifecycle.render(helpView(), {
    metadata: {
      title: "OpenStart Help — Guides for runners and organizers",
      description: "Learn how to register, manage races, accept test payments, communicate with participants, and run race day in OpenStart.",
    },
  });
}

function renderArchitecture() {
  pageLifecycle.render(architectureView(), {
    metadata: {
      title: "OpenStart Architecture — Platform overview",
      description: "A concise guide to OpenStart's system design, core domains, trust boundaries, and critical workflows.",
    },
  });
}

function renderDemo() {
  pageLifecycle.render(demoView(state), {
    metadata: {
      title: "OpenStart Demo — Explore every race-management feature",
      description: "Tour OpenStart features or create a private sample event with realistic demonstration data.",
    },
  });
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
  appStore.patch({ setupEventId: event.id }, "setup.opened");
  const readiness = configured ? await eventReadiness(event.id) : localReadiness(event);
  pageLifecycle.render(organizerViews.setup(event, step, readiness, state.session?.user?.email || ""), {
    metadata: { title: `${event.name} setup — OpenStart`, description: "Guided event setup and publishing." },
    sync: true,
    scroll: true,
  });
}

const effectivePrice = (tier) => {
  const now = Date.now();
  const active = (tier.os_tier_prices || []).filter((price) => new Date(price.starts_at).getTime() <= now)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return active[0]?.price_cents ?? tier.price_cents;
};
const publicViews = createPublicViews({ effectivePrice, eventRegistrations, tierById });
const discoveryResultsComponent = mountDiscoveryResultsComponent({
  store: appStore,
  publicViews,
  documentRef: document,
});
const noticeController = createNoticeController({ notice });
const dialogController = createDialogController({ dialog, content: dialogContent, onClose: stopScanner });
function showNotice(message, options) { noticeController.show(message, options); }

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

const navigationComponent = mountNavigationComponent({
  store: appStore,
  documentRef: document,
  authButton,
  signOutButton,
  platformNav,
});
const syncNavigation = () => navigationComponent.refresh();

const pageLifecycle = createPageLifecycle({
  page,
  setPageMetadata,
  syncNavigation,
  scrollToTop: () => scrollTo(0, 0),
});
const publicController = createPublicController({
  state,
  publicViews,
  listPublishedEvents,
  renderPage: pageLifecycle.render,
  hydrateEvent,
  parseRegion,
  stateFromCoords,
  showNotice,
  scrollToTop: () => scrollTo(0, 0),
  patchState: appStore.patch,
  refreshResults: discoveryResultsComponent.refresh,
});
const contentController = createContentController({ documentRef: document });
const { loadDiscovery, renderDiscover, renderEvent } = publicController;
publicController.restoreRegion();

async function loadPlatformAccess(){
  const platformAdmin = state.session ? await platformAdminAction("access").catch(()=>({allowed:false})) : null;
  appStore.patch({ platformAdmin }, "platform.access-loaded");
}

async function loadPlatformOverview(query=""){
  const platformData = await platformAdminAction("overview",{query});
  appStore.patch({ platformData }, "platform.overview-loaded");
}

function renderPlatformAdmin() {
  if (!state.platformData) return;
  pageLifecycle.render(platformViews.consolePage(state.platformData), {
    metadata: { title: "OpenStart Platform Operations", description: "Private operational controls for OpenStart." },
  });
}

async function renderSeries(series) {
  const standings=await seriesAction("standings",{seriesId:series.id});
  appStore.patch({ seriesStandings: standings }, "series.standings-loaded");
  pageLifecycle.render(seriesViews.publicPage(series, standings), {
    metadata: {
      title: `${series.name} — OpenStart`,
      description: series.description,
      image: series.banner_url || series.logo_url || "og.png",
    },
  });
}

function exportSeriesStandings(series) {
  const rows=[["rank","first_name","last_name","points","events_completed","wins","eligible"],...(state.seriesStandings?.individual || []).map((row)=>[row.rank,row.firstName,row.lastName,row.points,row.eventsCompleted,row.wins,row.eligible])];
  const csv=rows.map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));link.download=`${series.slug}-standings.csv`;link.click();URL.revokeObjectURL(link.href);
}

function renderDashboard() {
  pageLifecycle.render(organizerViews.dashboard(state, configured, eventById), {
    metadata: {
      title: "Organizer workspace — OpenStart",
      description: "Manage OpenStart events, registrations, finances, communications, and race-day operations.",
    },
  });
}

const lotteryViews = createLotteryViews({ effectivePrice, safeUrl, tierById });
const lotteryRunnerCard = lotteryViews.runnerCard;
const lotteryApplicationForm = lotteryViews.application;
const lotteryCheckoutForm = lotteryViews.checkout;
const lotteryLifecycleForm = lotteryViews.lifecycle;

function renderRunnerDashboard() {
  pageLifecycle.render(accountViews.runnerDashboard(state), {
    metadata: {
      title: "My races — OpenStart",
      description: "Manage your OpenStart registrations, results, teams, volunteer shifts, and athlete profile.",
    },
  });
}

function renderAthlete(data){
  appStore.patch({ view: "athlete", selectedEvent: null }, "athlete.opened");
  const {profile}=data;
  const name=profile.display_name || `@${profile.handle}`;
  pageLifecycle.render(accountViews.publicAthlete(data), {
    metadata: {
      title: `${name} · OpenStart athlete`,
      description: `Race history and personal bests for ${name} on OpenStart.`,
    },
    sync: true,
    focus: true,
    scroll: true,
  });
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

async function loadPublic() {
  const [discovery,series] = await Promise.all([
    listPublishedEvents({query:state.discoverQuery,region:state.discoverRegion,limit:state.discoverVisible,offset:0}),
    listPublishedSeries(),
  ]);
  const events = Array.isArray(discovery) ? discovery : discovery.events;
  const registrations = configured ? [] : await listRegistrations(events.map((event) => event.id));
  appStore.patch({
    events,
    discoverTotal: Array.isArray(discovery) ? discovery.length : discovery.total,
    series,
    registrations,
  }, "public.loaded");
}

async function loadDashboard() {
  const userId = state.session?.user?.id || DEMO_ORGANIZER_ID;
  const [events, profile, organizerMetrics, series] = await Promise.all([
    listOrganizerEvents(userId),
    getOrganizerProfile(userId),
    organizerEventMetrics(),
    listOrganizerSeries(userId),
  ]);
  const eventIds = events.map((event) => event.id);
  const loadedIds=[...state.loadedRegistrationEvents].filter((id)=>eventIds.includes(id));
  const [registrations, campaigns, emailTemplates, auditLog] = await Promise.all([
    loadedIds.length ? listRegistrations(loadedIds) : [],
    listOrganizerCampaigns(eventIds),
    listEmailTemplates(userId),
    listAuditLog(eventIds),
  ]);
  appStore.patch({
    events,
    profile,
    organizerMetrics,
    series,
    registrations,
    orderItems: [],
    campaigns,
    emailTemplates,
    auditLog,
    loadedRegistrationEvents: new Set(loadedIds),
  }, "organizer.loaded");
}

async function ensureEventRegistrations(eventId,force=false){
  if(!eventId || (!force && state.loadedRegistrationEvents.has(eventId))) return;
  const rows=await listRegistrations([eventId]);
  appStore.patch({
    registrations: state.registrations.filter((item)=>item.event_id!==eventId).concat(rows),
    loadedRegistrationEvents: new Set([...state.loadedRegistrationEvents, eventId]),
  }, "registrations.loaded");
}

async function loadRunnerDashboard() {
  const [runnerRegistrations, captainTeams, volunteerSignups, lotteryApplications, athleteProfile] = await Promise.all([
    listRunnerRegistrations(),
    listCaptainTeams(state.session.user.id),
    listMyVolunteerSignups(),
    listMyLotteryApplications(),
    getMyAthleteProfile(),
  ]);
  appStore.patch({ runnerRegistrations, captainTeams, volunteerSignups, lotteryApplications, athleteProfile }, "runner.loaded");
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
  afterNavigate: pageLifecycle.afterNavigate,
  batchState: appStore.batch,
  actionState: appStore.action,
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
  patchState: appStore.patch,
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
  updateWaitlist,
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
  patchState: appStore.patch,
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
    const [registrations, orderItems] = await Promise.all([
      listRegistrations(eventIds),
      listOrganizerOrderItems(eventIds),
    ]);
    appStore.patch({
      registrations,
      orderItems,
      loadedRegistrationEvents: new Set([...state.loadedRegistrationEvents, ...eventIds]),
    }, "financials.loaded");
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
  updateEventSections,
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

const demoController = createDemoController({
  state,
  openDialog,
  authForm,
  patchState: appStore.patch,
  createShowcaseEvent,
  deleteShowcaseEvent,
  loadDashboard,
  renderDemo,
  renderDashboard,
  renderRoster,
  hydrateEvent,
  showNotice,
  scrollToBottom: () => scrollTo(0, document.body.scrollHeight),
  launchers: {
    roster: (race) => { renderDashboard(); renderRoster(race); },
    registration: (race) => openDialog(registrationSettingsForm(race)),
    website: (race) => openDialog(siteEditorForm(race)),
    pricing: (race) => openDialog(pricingSettingsForm(race)),
    products: (race) => openDialog(productSettingsForm(race)),
    waves: (race) => openDialog(waveManagerForm(race)),
    volunteers: (race) => openDialog(volunteerManagerForm(race)),
    "race-day": (race) => openDialog(raceDayForm(race)),
    results: (race) => openDialog(resultsManagerForm(race)),
    lottery: (race) => openDialog(lotteryLifecycleForm(race)),
    checklist: (race) => openDialog(checklistForm(race)),
  },
  patchState: appStore.patch,
});

const accountController = createAccountController({
  state,
  accountAction,
  beginStripeOnboarding,
  getAthleteProfile,
  eventById,
  openDialog,
  healthForm,
  embedSnippetForm,
  athleteProfileForm,
  downloadJson,
  showNotice,
  go,
  renderAthlete,
  authApi: supabase.auth,
  loadPlatformAccess,
  closeDialog: () => dialog.close(),
  loadPublic,
  hydrateEvent,
  renderEvent,
  afterNavigate: () => pageLifecycle.afterNavigate(),
  lotteryApplicationForm,
  saveAthleteProfile,
  renderRunnerDashboard,
  configured,
  authForm,
});

const featureControllers = [
  publicController,
  contentController,
  demoController,
  accountController,
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

const shellController = createShellController({
  state,
  eventById,
  ensureEventRegistrations,
  renderSetupWizard,
  go,
  dispatchFeatureClick,
  resetDemo,
  showNotice,
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  await shellController.handleClick(target);
});

// Enter (or blur) on the manual place field resolves a typed city/state.
document.addEventListener("keydown", (event) => {
  publicController.handleKeydown(event.target, event);
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const releaseBusy = busyController.begin(form, event.submitter);
  if (!releaseBusy) return;
  try {
    if (await dispatchFeatureSubmit(form, data, event.submitter)) return;
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
  await dispatchFeatureChange(event.target);
});
document.addEventListener("input", async (event) => {
  if (await dispatchFeatureInput(event.target)) return;
});
document.addEventListener("dragstart",(event)=>{
  eventSiteController.handleDragStart(event.target);
});
document.addEventListener("dragend",(event)=>{
  eventSiteController.handleDragEnd(event.target);
});
document.addEventListener("dragover",(event)=>{
  eventSiteController.handleDragOver(event.target, event.clientY, () => event.preventDefault());
});
document.addEventListener("drop",async(event)=>{
  await eventSiteController.handleDrop(event.target, () => event.preventDefault());
});
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  showNotice(event.reason?.message || "Something went wrong.", { type: "error", duration: 0 });
});
authButton.addEventListener("click", () => {
  accountController.requestSignIn();
});
signOutButton.addEventListener("click", async () => {
  await accountController.signOut();
});
async function boot() {
  setupBanner.classList.toggle("hidden", configured);
  if (configured) {
    const { data } = await supabase.auth.getSession();
    appStore.patch({ session: data.session }, "auth.restored");
    await loadPlatformAccess();
    supabase.auth.onAuthStateChange((_event, session) => {
      appStore.patch(session ? { session } : {
        session: null,
        registrations: [],
        loadedRegistrationEvents: new Set(),
      }, session ? "auth.changed" : "auth.cleared");
      setTimeout(()=>loadPlatformAccess(),0);
    });
  }
  const params = new URLSearchParams(location.search);
  const pendingTransfer = params.get("transfer");
  appStore.patch(
    pendingTransfer ? { pendingTransfer, pendingView: "runner" } : { pendingTransfer: null },
    "bootstrap.transfer",
  );
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
  pageLifecycle.error(`<section class="empty-state">OpenStart could not load: ${escapeHtml(error.message)}</section>`);
});
