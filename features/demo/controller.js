export function createDemoController({
  state,
  openDialog,
  authForm,
  createShowcaseEvent,
  deleteShowcaseEvent,
  loadDashboard,
  renderDemo,
  renderDashboard,
  renderRoster,
  hydrateEvent,
  showNotice,
  confirmAction = confirm,
  scrollToBottom = () => scrollTo(0, document.body.scrollHeight),
  launchers,
  patchState = (values) => Object.assign(state, values),
}) {
  async function handleClick(target) {
    if (target.matches("[data-demo-sign-in]")) {
      patchState({ pendingView: "demo" }, "demo.auth-requested");
      openDialog(authForm());
      return true;
    }

    if (target.matches("[data-create-showcase]")) {
      target.disabled = true;
      try {
        await createShowcaseEvent();
        await loadDashboard();
        renderDemo();
        showNotice("Your private showcase is ready.");
      } catch (error) {
        target.disabled = false;
        showNotice(error.message || "The showcase could not be created.", { type: "error", duration: 0 });
      }
      return true;
    }

    if (target.dataset.deleteShowcase) {
      if (!confirmAction("Remove this private showcase and all of its sample data? Your real events will not be affected.")) return true;
      await deleteShowcaseEvent(target.dataset.deleteShowcase);
      await loadDashboard();
      renderDemo();
      showNotice("Showcase removed. Your real events were not changed.");
      return true;
    }

    if (target.dataset.demoRoster) {
      const race = await hydrateEvent(target.dataset.demoRoster);
      renderDashboard();
      renderRoster(race);
      scrollToBottom();
      return true;
    }

    if (target.dataset.demoFeature) {
      const race = await hydrateEvent(target.dataset.eventIdDemo);
      launchers[target.dataset.demoFeature]?.(race);
      return true;
    }

    return false;
  }

  return { handleClick };
}
