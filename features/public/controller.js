export function createPublicController({
  state,
  page,
  publicViews,
  listPublishedEvents,
  setPageMetadata,
  hydrateEvent,
  parseRegion,
  stateFromCoords,
  showNotice,
  documentRef = document,
  storage = localStorage,
  geolocation = navigator.geolocation,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  scrollToTop = () => scrollTo(0, 0),
  discoverPageSize = 12,
}) {
  let searchTimer = null;

  const publishedEvents = () => state.events.filter((event) => event.status === "published");
  const discoveryModel = () => publicViews.discoveryModel(state, publishedEvents());

  function renderDiscover() {
    setPageMetadata();
    page.innerHTML = publicViews.discoveryPage(discoveryModel());
  }

  function refreshDiscover() {
    const results = documentRef.querySelector("#discover-results");
    if (!results) return false;
    const model = discoveryModel();
    results.innerHTML = publicViews.discoveryResults(model);
    const count = documentRef.querySelector("#discover-count");
    if (count) count.textContent = model.countLabel;
    return true;
  }

  function renderEvent(event, preview = false) {
    const model = publicViews.eventModel(event, preview);
    setPageMetadata(`${event.name} — OpenStart`, event.description, event.banner_url || event.logo_url || "og.png");
    page.innerHTML = publicViews.eventPage(model);
  }

  async function loadDiscovery() {
    const request = ++state.discoverRequest;
    const result = await listPublishedEvents({
      query: state.discoverQuery,
      region: state.discoverRegion,
      limit: state.discoverVisible,
      offset: 0,
    });
    if (request !== state.discoverRequest) return false;
    if (Array.isArray(result)) {
      state.events = result;
      state.discoverTotal = result.length;
    } else {
      state.events = result.events;
      state.discoverTotal = result.total;
    }
    return true;
  }

  async function setRegion(region) {
    state.discoverRegion = region;
    state.discoverVisible = discoverPageSize;
    try {
      if (region) storage.setItem("openstart-region", JSON.stringify(region));
      else storage.removeItem("openstart-region");
    } catch { /* private browsing: the region simply will not persist */ }
    await loadDiscovery();
    renderDiscover();
  }

  function restoreRegion() {
    try {
      const saved = JSON.parse(storage.getItem("openstart-region") || "null");
      if (saved?.state) state.discoverRegion = saved;
    } catch { /* ignore missing or unreadable storage */ }
    return state.discoverRegion;
  }

  async function showMore() {
    state.discoverVisible += discoverPageSize;
    await loadDiscovery();
    refreshDiscover();
  }

  function search(value) {
    state.discoverQuery = value;
    state.discoverVisible = discoverPageSize;
    if (searchTimer) cancelSchedule(searchTimer);
    searchTimer = schedule(async () => {
      searchTimer = null;
      await loadDiscovery();
      refreshDiscover();
    }, 250);
  }

  async function resolvePlace(value) {
    const typed = parseRegion(value);
    if (!typed.state) {
      showNotice('Enter a city and state, for example "Boulder, CO".');
      return false;
    }
    await setRegion(typed);
    return true;
  }

  async function useLocation(button) {
    if (!geolocation) {
      showNotice("This browser cannot share a location. Enter a city instead.");
      return false;
    }
    button.disabled = true;
    button.textContent = "Locating…";
    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        async (position) => {
          const code = stateFromCoords(position.coords.latitude, position.coords.longitude);
          if (!code) {
            showNotice("We could not match that location. Enter a city instead.");
            renderDiscover();
            resolve(false);
            return;
          }
          await setRegion({ city: "", state: code });
          resolve(true);
        },
        () => {
          showNotice("Location permission was declined. Enter a city instead.");
          renderDiscover();
          resolve(false);
        },
        { timeout: 10000, maximumAge: 600000 },
      );
    });
  }

  async function openEvent(id) {
    state.selectedEvent = await hydrateEvent(id);
    if (!state.selectedEvent) return false;
    renderEvent(state.selectedEvent);
    scrollToTop();
    return true;
  }

  return {
    loadDiscovery,
    openEvent,
    refreshDiscover,
    renderDiscover,
    renderEvent,
    resolvePlace,
    restoreRegion,
    search,
    setRegion,
    showMore,
    useLocation,
  };
}
