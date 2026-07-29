export function createAccountController({
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
  confirmAction = confirm,
  documentRef = document,
  clipboard = navigator.clipboard,
  locationRef = location,
  historyRef = history,
  today = () => new Date().toISOString().slice(0, 10),
}) {
  async function handleClick(target) {
    if (target.matches("[data-system-health]")) {
      openDialog(healthForm(await accountAction("health")));
      return true;
    }

    if (target.matches("[data-export-account]")) {
      const accountExport = await accountAction("export");
      downloadJson(`openstart-data-${today()}.json`, accountExport);
      showNotice("Your OpenStart data export was downloaded.");
      return true;
    }

    if (target.matches("[data-delete-account]")) {
      if (!confirmAction("Permanently delete your OpenStart account and anonymize your runner data? This cannot be undone.")) return true;
      if (!confirmAction("Final confirmation: delete this account now?")) return true;
      await accountAction("delete");
      state.session = null;
      await go("discover");
      showNotice("Your account was deleted and participant data was anonymized.");
      return true;
    }

    if (target.dataset.embedCode) {
      const race = eventById(target.dataset.embedCode);
      if (race) openDialog(embedSnippetForm(race));
      return true;
    }

    if (target.matches("[data-copy-embed]")) {
      const textarea = documentRef.querySelector("#embed-snippet");
      if (textarea) {
        textarea.select();
        try {
          await clipboard?.writeText(textarea.value);
          showNotice("Embed code copied.");
        } catch { /* selection remains available for a manual copy */ }
      }
      return true;
    }

    if (target.matches("[data-connect-stripe]")) {
      target.disabled = true;
      target.textContent = "Opening Stripe…";
      try {
        const returnUrl = `${locationRef.origin}${locationRef.pathname}?stripe=return`;
        const url = await beginStripeOnboarding(returnUrl);
        locationRef.assign(url);
      } catch (error) {
        target.disabled = false;
        showNotice(error.message || "Stripe onboarding could not start.", { type: "error", duration: 0 });
        await go("dashboard");
      }
      return true;
    }

    if (target.matches("[data-edit-athlete]")) {
      openDialog(athleteProfileForm(state.athleteProfile));
      return true;
    }

    if (target.dataset.viewAthlete) {
      const athlete = await getAthleteProfile(target.dataset.viewAthlete);
      if (!athlete) {
        showNotice("That athlete page isn't public yet.");
        return true;
      }
      historyRef.replaceState({}, "", `${locationRef.pathname}?athlete=${target.dataset.viewAthlete}`);
      renderAthlete(athlete);
      return true;
    }

    return false;
  }

  return { handleClick };
}
