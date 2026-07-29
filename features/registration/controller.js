export function createRegistrationController({
  state,
  eventById,
  openDialog,
  forms,
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
  patchState = (values) => Object.assign(state, values),
}) {
  async function handleClick(target) {
    if (target.dataset.register) {
      openDialog(forms.registration(eventById(target.dataset.register)));
      return true;
    }
    if (target.dataset.applyLottery) {
      const race = eventById(target.dataset.applyLottery);
      if (!state.session) {
        patchState({ pendingLotteryEvent: race.id, pendingView: "discover" }, "lottery.auth-required");
        openDialog(forms.auth());
      } else openDialog(forms.lotteryApplication(race));
      return true;
    }
    if (target.matches("[data-add-participant-field]")) {
      const form = target.closest("form");
      const race = eventById(form.dataset.eventId);
      const container = form.querySelector("#participant-fields");
      const count = container.querySelectorAll(".participant-block").length;
      if (count >= 10) showNotice("An order can contain up to 10 participants.");
      else container.insertAdjacentHTML("beforeend", participantFields(race, count));
      return true;
    }
    if (target.matches("[data-remove-participant]")) {
      target.closest(".participant-block").remove();
      return true;
    }
    if (target.dataset.claimLottery) {
      const application = state.lotteryApplications.find((item) => item.id === target.dataset.claimLottery);
      openDialog(forms.lotteryCheckout(application));
      return true;
    }
    if (target.dataset.withdrawLottery) {
      if (confirm("Withdraw this lottery application? You can reapply only while applications remain open.")) {
        await withdrawLotteryApplication(target.dataset.withdrawLottery);
        await go("runner");
        showNotice("Lottery application withdrawn.");
      }
      return true;
    }
    if (target.dataset.editRegistration) {
      const item = state.registrations.find((registration) => registration.id === target.dataset.editRegistration);
      openDialog(forms.editRegistration(item));
      return true;
    }
    if (target.dataset.manageRunner) {
      const item = state.runnerRegistrations.find((registration) => registration.id === target.dataset.manageRunner);
      openDialog(forms.runnerRegistration(item));
      return true;
    }
    if (target.dataset.createTransfer) {
      const result = await registrationAction("create_transfer", { registrationId: target.dataset.createTransfer });
      await loadRunnerDashboard();
      const item = state.runnerRegistrations.find((registration) => registration.id === target.dataset.createTransfer);
      openDialog(forms.runnerRegistration(item));
      await navigator.clipboard?.writeText(`${location.origin}${location.pathname}?transfer=${result.token}`).catch(() => {});
      showNotice("Transfer link created and copied. It expires in 7 days.");
      return true;
    }
    if (target.dataset.requestCancel) {
      if (confirm("Request cancellation for this registration? The organizer will review any refund.")) {
        await registrationAction("request_cancel", { registrationId: target.dataset.requestCancel });
        dialog.close();
        await go("runner");
        showNotice("Cancellation requested.");
      }
      return true;
    }
    if (target.dataset.organizerRefund) {
      if (confirm("Issue a full Stripe refund and cancel this registration? This cannot be undone.")) {
        await registrationAction("organizer_refund", { registrationId: target.dataset.organizerRefund });
        dialog.close();
        await go("dashboard");
        showNotice("Registration refunded and cancelled.");
      }
      return true;
    }
    if (target.dataset.organizerCancel) {
      if (confirm("Cancel this registration?")) {
        await registrationAction("organizer_cancel", { registrationId: target.dataset.organizerCancel });
        dialog.close();
        await go("dashboard");
        showNotice("Registration cancelled.");
      }
      return true;
    }
    if (target.dataset.resendConfirmation) {
      target.disabled = true;
      try {
        await resendConfirmation(target.dataset.resendConfirmation);
        showNotice("Confirmation email sent.");
      } catch (error) {
        showNotice(error.message || "Confirmation email could not be sent.");
      } finally {
        target.disabled = false;
      }
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "registration-form") {
      const race = eventById(form.dataset.eventId);
      const participants = [...form.querySelectorAll(".participant-block")].map((block) => ({
        tierId: block.querySelector("[data-field='tier_id']").value,
        waveId: block.querySelector("[data-field='wave_id']")?.value || null,
        estimatedPaceSeconds: block.querySelector("[data-field='estimated_pace']")?.value
          ? Math.round(parseResultTime(block.querySelector("[data-field='estimated_pace']").value) / 1000) : null,
        firstName: block.querySelector("[name='first_name']").value,
        lastName: block.querySelector("[name='last_name']").value,
        email: block.querySelector("[name='email']").value,
        emergencyContact: block.querySelector("[name='emergency_contact']").value,
        relayLeg: block.querySelector("[name='relay_leg']").value || null,
        answers: [...block.querySelectorAll("[data-question-id]")].map((input) => ({
          questionId: input.dataset.questionId,
          answer: input.type === "checkbox" ? (input.checked ? "Yes" : "") : input.value,
        })),
        waiverAccepted: !race.waiver_text || block.querySelector("[name='waiver']")?.checked === true,
        waiverVersion: race.waiver_text ? String(race.updated_at || race.id) : null,
        idempotencyKey: crypto.randomUUID(),
      }));
      const teamMode = data.get("team_mode");
      const items = [...form.querySelectorAll(".product-options > div")].map((row) => ({
        variantId: row.querySelector("[data-product-variant]").value,
        quantity: Number(row.querySelector("[data-product-quantity]").value) || 1,
      })).filter((item) => item.variantId);
      const result = await beginRegistration({
        eventId: race.id,
        email: data.get("purchaser_email"),
        participants,
        team: teamMode ? {
          mode: teamMode,
          teamId: data.get("team_id") || null,
          name: data.get("team_name") || null,
          category: data.get("team_category"),
          joinCode: data.get("team_code") || null,
        } : null,
        items,
        donationCents: Math.max(0, Math.round(Number(data.get("donation_amount") || 0) * 100)),
        dedication: data.get("dedication") || null,
        anonymousDonation: data.get("anonymous_donation") === "on",
        promoCode: data.get("promo_code") || null,
        joinWaitlist: data.get("join_waitlist") === "on",
        idempotencyKey: crypto.randomUUID(),
        successUrl: `${location.origin}${location.pathname}`,
        cancelUrl: `${location.origin}${location.pathname}`,
      });
      if (result.checkoutUrl) {
        form.dataset.keepBusy = "true";
        location.assign(result.checkoutUrl);
      }
      else {
        dialog.close();
        if (result.status === "waitlisted") showNotice("This option is full. You have been added to the waitlist.");
        else {
          await loadPublic();
          patchState({ selectedEvent: await hydrateEvent(race.id) }, "registration.completed");
          renderEvent(state.selectedEvent);
          showNotice(result.status === "confirmed" ? "Registration confirmed." : "Registration saved.");
        }
      }
      return true;
    }
    if (form.id === "lottery-application-form") {
      const race = eventById(form.dataset.eventId);
      await submitLotteryApplication({
        p_event_id: race.id,
        p_tier_id: data.get("tier_id"),
        p_first_name: data.get("first_name"),
        p_last_name: data.get("last_name"),
        p_qualifier_name: data.get("qualifier_name") || null,
        p_qualifier_date: data.get("qualifier_date") || null,
        p_qualifier_result: data.get("qualifier_result") || null,
        p_qualifier_url: data.get("qualifier_url") || null,
        p_qualifier_notes: data.get("qualifier_notes") || "",
      });
      dialog.close();
      await go("runner");
      showNotice("Lottery application submitted. You will not be charged unless selected.");
      return true;
    }
    if (form.id === "lottery-checkout-form") {
      const application = state.lotteryApplications.find((item) => item.id === form.dataset.applicationId);
      const result = await lotteryAction("checkout", {
        applicationId: application.id,
        emergencyContact: data.get("emergency_contact"),
        answers: [...form.querySelectorAll("[data-question-id]")].map((input) => ({
          questionId: input.dataset.questionId,
          answer: input.type === "checkbox" ? (input.checked ? "Yes" : "") : input.value,
        })),
        waiverAccepted: !application.os_events?.waiver_text || data.get("waiver") === "on",
        waiverVersion: application.os_events?.waiver_text ? String(application.os_events.updated_at || application.id) : null,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.checkoutUrl) {
        form.dataset.keepBusy = "true";
        location.assign(result.checkoutUrl);
      }
      else {
        dialog.close();
        await go("runner");
        showNotice("Lottery registration confirmed.");
      }
      return true;
    }
    if (form.id === "manual-registration-form") {
      const race = eventById(form.dataset.eventId);
      await createManualRegistration({
        event_id: race.id,
        tier_id: data.get("tier_id"),
        first_name: data.get("first_name"),
        last_name: data.get("last_name"),
        email: data.get("email"),
        emergency_contact: data.get("emergency_contact"),
        bib_number: data.get("bib_number") || null,
        organizer_notes: data.get("organizer_notes") || "",
      });
      dialog.close();
      await loadDashboard();
      renderDashboard();
      renderRoster(eventById(race.id));
      showNotice("Manual registration added.");
      return true;
    }
    if (form.id === "edit-registration-form") {
      const item = state.registrations.find((registration) => registration.id === form.dataset.registrationId);
      await updateRegistration(item.id, {
        first_name: data.get("first_name"),
        last_name: data.get("last_name"),
        email: data.get("email"),
        emergency_contact: data.get("emergency_contact"),
        bib_number: data.get("bib_number"),
        organizer_notes: data.get("organizer_notes"),
        status: data.get("status"),
      });
      dialog.close();
      await loadDashboard();
      renderDashboard();
      renderRoster(eventById(item.event_id));
      showNotice("Registration updated.");
      return true;
    }
    if (form.id === "runner-registration-form") {
      await registrationAction("runner_update", {
        registrationId: form.dataset.registrationId,
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        emergencyContact: data.get("emergency_contact"),
      });
      dialog.close();
      await go("runner");
      showNotice("Participant details updated.");
      return true;
    }
    if (form.id === "accept-transfer-form") {
      await registrationAction("accept_transfer", {
        token: form.dataset.token,
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        emergencyContact: data.get("emergency_contact"),
      });
      dialog.close();
      patchState({ pendingTransfer: null }, "transfer.accepted");
      history.replaceState({}, "", location.pathname);
      await go("runner");
      showNotice("Registration transfer accepted.");
      return true;
    }
    return false;
  }

  function handleChange(target) {
    if (!target.matches("[data-field='tier_id']")) return false;
    const block = target.closest(".participant-block");
    const waveSelect = block?.querySelector("[data-field='wave_id']");
    if (waveSelect) {
      waveSelect.value = "";
      [...waveSelect.options].forEach((option) => {
        option.hidden = Boolean(option.dataset.tier && option.dataset.tier !== target.value);
      });
    }
    return true;
  }

  return { handleClick, handleSubmit, handleChange };
}
