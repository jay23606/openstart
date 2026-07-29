export function createAppState() {
  return {
    view: "discover",
    discoverQuery: "",
    discoverRegion: null,
    discoverVisible: 12,
    discoverTotal: 0,
    discoverRequest: 0,
    organizerMetrics: [],
    loadedRegistrationEvents: new Set(),
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
    lotteryApplications: [],
    auditLog: [],
    series: [],
    seriesStandings: null,
    pendingView: "runner",
    pendingTransfer: null,
    pendingLotteryEvent: null,
    setupEventId: null,
    navigationId: 0,
    platformAdmin: null,
    platformData: null,
    athleteProfile: null,
  };
}

export const eventById = (state, id) => state.events.find((event) => event.id === id);
export const tierById = (event, id) => event?.os_event_tiers?.find((tier) => tier.id === id);
export const eventRegistrations = (state, id) =>
  state.registrations.filter((registration) => registration.event_id === id);
