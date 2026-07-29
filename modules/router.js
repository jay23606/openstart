const defaultViews = ["discover", "demo", "runner", "dashboard", "platform", "help", "architecture"];

export function normalizeView(view, views = defaultViews) {
  return views.includes(view) ? view : "discover";
}

export function routeUrl(currentUrl, view) {
  const url = new URL(currentUrl);
  ["athlete", "series", "results"].forEach((key) => url.searchParams.delete(key));
  if (view === "discover") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function createRouter({
  state,
  configured,
  routes,
  protectedViews = ["dashboard", "runner", "platform"],
  onAuthRequired,
  afterNavigate,
}) {
  const views = Object.keys(routes);

  async function navigate(requestedView, { syncUrl = true } = {}) {
    const view = normalizeView(requestedView, views);
    if (protectedViews.includes(view) && configured && !state.session) {
      state.pendingView = view;
      onAuthRequired(view);
      return false;
    }

    const navigationId = ++state.navigationId;
    state.view = view;
    state.selectedEvent = null;
    const commit = await routes[view]({ navigationId, navigate });
    if (navigationId !== state.navigationId) return false;

    if (commit) commit();
    if (syncUrl) history.replaceState({}, "", routeUrl(location.href, view));
    afterNavigate(view);
    return true;
  }

  return { navigate };
}
