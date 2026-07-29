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
  authApi,
  loadPlatformAccess,
  closeDialog,
  loadPublic,
  hydrateEvent,
  renderEvent,
  afterNavigate,
  lotteryApplicationForm,
  saveAthleteProfile,
  renderRunnerDashboard,
  configured = true,
  authForm,
  patchState = (values) => Object.assign(state, values),
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
      patchState({ session: null });
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

  async function handleSubmit(form, data, submitter) {
    if (form.id === "auth-form") {
      const intent = submitter?.value || "signin";
      const credentials = { email: data.get("email"), password: data.get("password") };
      const result = intent === "signup"
        ? await authApi.signUp(credentials)
        : await authApi.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (!result.data.session) {
        form.querySelector(".form-message").textContent = "Check your email to confirm your account.";
        return true;
      }

      patchState({ session: result.data.session });
      await loadPlatformAccess();
      closeDialog();
      if (state.pendingLotteryEvent) {
        const lotteryEventId = state.pendingLotteryEvent;
        await loadPublic();
        const selectedEvent = await hydrateEvent(lotteryEventId);
        patchState({ pendingLotteryEvent: null, selectedEvent });
        renderEvent(state.selectedEvent);
        afterNavigate();
        openDialog(lotteryApplicationForm(state.selectedEvent));
      } else {
        await go(state.pendingView || "runner");
      }
      return true;
    }

    if (form.id === "athlete-profile-form") {
      const payload = {
        handle: String(data.get("handle") || "").trim().toLowerCase(),
        display_name: String(data.get("display_name") || "").trim(),
        location: String(data.get("location") || "").trim(),
        bio: String(data.get("bio") || "").trim(),
        is_public: data.get("is_public") === "on",
      };
      try {
        patchState({ athleteProfile: await saveAthleteProfile(payload) });
        closeDialog();
        renderRunnerDashboard();
        showNotice("Athlete profile saved.");
      } catch (error) {
        form.querySelector(".form-message").textContent = /duplicate|unique/i.test(error.message || "")
          ? "That handle is already taken. Try another."
          : (error.message || "The profile could not be saved.");
      }
      return true;
    }

    return false;
  }

  function requestSignIn() {
    patchState({ pendingView: "runner" });
    if (configured) openDialog(authForm());
    else showNotice("Add Supabase credentials in config.js to enable accounts.");
  }

  async function signOut() {
    await authApi.signOut();
    patchState({
      session: null,
      platformAdmin: null,
      registrations: [],
      loadedRegistrationEvents: new Set(),
    });
    await go("discover");
  }

  return { handleClick, handleSubmit, requestSignIn, signOut };
}
