export function createRaceDayController({
  state,
  eventById,
  openDialog,
  forms,
  raceDayAction,
  updateOrderItem,
  startQrScanner,
  exportRoster,
  loadAndExportFinancials,
  raceDayResults,
  loadDashboard,
  showNotice,
}) {
  async function refresh(eventId) {
    await loadDashboard();
    openDialog(forms.manager(eventById(eventId)));
  }

  async function handleClick(target) {
    if (target.dataset.raceDay) {
      openDialog(forms.manager(eventById(target.dataset.raceDay)));
      return true;
    }
    if (target.dataset.startScanner) {
      await startQrScanner(target.dataset.startScanner);
      return true;
    }
    if (target.dataset.exportRoster) {
      exportRoster(eventById(target.dataset.exportRoster));
      return true;
    }
    if (target.matches("[data-export-finance]")) {
      await loadAndExportFinancials();
      return true;
    }
    if (target.dataset.viewPass) {
      const item = state.runnerRegistrations.find((registration) => registration.id === target.dataset.viewPass);
      const pass = await raceDayAction("get_pass", { registrationId: item.id });
      openDialog(forms.pass(item, pass));
      return true;
    }
    if (target.dataset.pickup) {
      await raceDayAction("pickup", { registrationId: target.dataset.pickup });
      target.textContent = "\u2713 Packet";
      target.disabled = true;
      showNotice("Packet pickup recorded.");
      return true;
    }
    if (target.dataset.checkin) {
      await raceDayAction("checkin", { registrationId: target.dataset.checkin });
      target.textContent = "\u2713 Checked in";
      target.disabled = true;
      showNotice("Participant checked in.");
      return true;
    }
    if (target.dataset.fulfillItem) {
      await updateOrderItem(target.dataset.fulfillItem, {});
      target.textContent = "\u2713 Fulfilled";
      target.disabled = true;
      showNotice("Merchandise marked fulfilled.");
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "race-day-lookup-form") {
      const result = await raceDayAction("lookup", {
        eventId: form.dataset.eventId,
        term: data.get("term"),
      });
      form.parentElement.querySelector("#race-day-results").innerHTML = raceDayResults(result.registrations || []);
      return true;
    }
    if (form.id === "bulk-bib-form") {
      const result = await raceDayAction("bulk_assign_bibs", {
        eventId: form.dataset.eventId,
        tierId: data.get("tier_id") || null,
        startNumber: Number(data.get("start_number")),
      });
      await refresh(form.dataset.eventId);
      showNotice(`${result.assigned} bibs assigned.`);
      return true;
    }
    if (form.id === "staff-form") {
      await raceDayAction("add_staff", {
        eventId: form.dataset.eventId,
        email: data.get("email"),
        role: data.get("role"),
      });
      await refresh(form.dataset.eventId);
      showNotice("Race-day staff member added.");
      return true;
    }
    if (form.id === "walkup-form") {
      await raceDayAction("walkup", {
        eventId: form.dataset.eventId,
        tierId: data.get("tier_id"),
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        email: data.get("email"),
        emergencyContact: data.get("emergency_contact"),
        bibNumber: data.get("bib_number") || null,
      });
      await refresh(form.dataset.eventId);
      showNotice("Walk-up participant added.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
