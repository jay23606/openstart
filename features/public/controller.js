export function createPublicController({
  state,
  publicViews,
  listPublishedEvents,
  renderPage,
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
  patchState = (values) => Object.assign(state, values),
}) {
  let searchTimer = null;

  const publishedEvents = () => state.events.filter((event) => event.status === "published");
  const discoveryModel = () => publicViews.discoveryModel(state, publishedEvents());

  function renderDiscover() {
    renderPage(publicViews.discoveryPage(discoveryModel()), { metadata: {} });
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
    renderPage(publicViews.eventPage(model), {
      metadata: {
        title: `${event.name} — OpenStart`,
        description: event.description,
        image: event.banner_url || event.logo_url || "og.png",
      },
    });
  }

  async function loadDiscovery() {
    const request = state.discoverRequest + 1;
    patchState({ discoverRequest: request }, "discovery.requested");
    const result = await listPublishedEvents({
      query: state.discoverQuery,
      region: state.discoverRegion,
      limit: state.discoverVisible,
      offset: 0,
    });
    if (request !== state.discoverRequest) return false;
    patchState(Array.isArray(result)
      ? { events: result, discoverTotal: result.length }
      : { events: result.events, discoverTotal: result.total }, "discovery.loaded");
    return true;
  }

  async function setRegion(region) {
    patchState({ discoverRegion: region, discoverVisible: discoverPageSize }, "discovery.region-changed");
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
      if (saved?.state) patchState({ discoverRegion: saved }, "discovery.region-restored");
    } catch { /* ignore missing or unreadable storage */ }
    return state.discoverRegion;
  }

  async function showMore() {
    patchState({ discoverVisible: state.discoverVisible + discoverPageSize }, "discovery.page-expanded");
    await loadDiscovery();
    refreshDiscover();
  }

  function search(value) {
    patchState({ discoverQuery: value, discoverVisible: discoverPageSize }, "discovery.query-changed");
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
    patchState({ selectedEvent: await hydrateEvent(id) }, "event.opened");
    if (!state.selectedEvent) return false;
    renderEvent(state.selectedEvent);
    scrollToTop();
    return true;
  }

  async function handleClick(target) {
    if (target.matches("[data-show-more]")) {
      await showMore();
      return true;
    }
    if (target.matches("[data-clear-location]")) {
      await setRegion(null);
      return true;
    }
    if (target.matches("[data-use-location]")) {
      await useLocation(target);
      return true;
    }
    if (target.dataset.eventId) {
      await openEvent(target.dataset.eventId);
      return true;
    }
    return false;
  }

  function handleInput(target) {
    if (target.id !== "discover-search") return false;
    search(target.value);
    return true;
  }

  function handleKeydown(target, event) {
    if (target.id !== "discover-place" || event.key !== "Enter") return false;
    event.preventDefault();
    resolvePlace(target.value);
    return true;
  }

  return {
    handleClick,
    handleInput,
    handleKeydown,
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
