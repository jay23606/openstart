export function createShellController({
  state,
  eventById,
  ensureEventRegistrations,
  renderSetupWizard,
  go,
  dispatchFeatureClick,
  resetDemo,
  showNotice,
  documentRef = document,
  historyRef = history,
  locationRef = location,
}) {
  async function hydrateActionEvent(target) {
    if (!["dashboard", "demo"].includes(state.view)) return;
    const eventId = Object.values(target.dataset).find((value) => eventById(value));
    if (eventId) await ensureEventRegistrations(eventId);
  }

  async function handleClick(target) {
    await hydrateActionEvent(target);

    if (target.matches("[data-view]")) {
      await go(target.dataset.view);
      return true;
    }

    if (target.matches("[data-action='discover'], [data-back]")) {
      if (state.setupEventId) {
        const setupEvent = eventById(state.setupEventId);
        if (setupEvent) {
          await renderSetupWizard(setupEvent, 5);
          return true;
        }
      }
      historyRef.replaceState({}, "", locationRef.pathname);
      await go("discover");
      return true;
    }

    if (target.matches("[data-go-dashboard]")) {
      await go("dashboard");
      return true;
    }

    if (await dispatchFeatureClick(target)) return true;

    if (target.matches("[data-close-roster]")) {
      const rosterSlot = documentRef.querySelector("#roster-slot");
      if (rosterSlot) rosterSlot.innerHTML = "";
      return true;
    }

    if (target.matches("[data-reset-demo]")) {
      resetDemo();
      await go("dashboard");
      showNotice("Demo data restored.");
      return true;
    }

    return false;
  }

  return { handleClick };
}
