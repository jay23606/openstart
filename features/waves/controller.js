export function createWavesController({
  state,
  eventById,
  openDialog,
  forms,
  createWave,
  deleteWave,
  wavesAction,
  parseResultTime,
  loadDashboard,
  dialog,
  go,
  showNotice,
}) {
  async function refresh(eventId) {
    await loadDashboard();
    openDialog(forms.manager(eventById(eventId)));
  }

  async function handleClick(target) {
    if (target.dataset.waveManager) {
      openDialog(forms.manager(eventById(target.dataset.waveManager)));
      return true;
    }
    if (target.dataset.runnerWave) {
      openDialog(forms.runner(state.runnerRegistrations.find((item) => item.id === target.dataset.runnerWave)));
      return true;
    }
    if (target.dataset.deleteWave) {
      await deleteWave(target.dataset.deleteWave);
      await refresh(target.dataset.event);
      showNotice("Wave deleted.");
      return true;
    }
    if (target.dataset.startWave) {
      await wavesAction("start", { eventId: target.dataset.event, waveId: target.dataset.startWave });
      await refresh(target.dataset.event);
      showNotice("Wave start time recorded.");
      return true;
    }
    if (target.dataset.waveBibs) {
      const result = await wavesAction("assign_bibs", {
        eventId: target.dataset.event,
        waveId: target.dataset.waveBibs,
      });
      await refresh(target.dataset.event);
      showNotice(`${result.assigned} bibs assigned.`);
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "wave-form") {
      const race = eventById(form.dataset.eventId);
      await createWave({
        event_id: race.id,
        tier_id: data.get("tier_id"),
        name: data.get("name"),
        starts_at: new Date(data.get("starts_at")).toISOString(),
        capacity: Number(data.get("capacity")),
        min_pace_seconds: data.get("min_pace") ? Math.round(parseResultTime(data.get("min_pace")) / 1000) : null,
        max_pace_seconds: data.get("max_pace") ? Math.round(parseResultTime(data.get("max_pace")) / 1000) : null,
        bib_start: data.get("bib_start") ? Number(data.get("bib_start")) : null,
        bib_end: data.get("bib_end") ? Number(data.get("bib_end")) : null,
        selection_closes_at: data.get("selection_closes_at")
          ? new Date(data.get("selection_closes_at")).toISOString()
          : null,
        self_select: data.get("self_select") === "on",
        sort_order: (race.os_waves || []).length,
      });
      await refresh(race.id);
      showNotice("Start wave created.");
      return true;
    }
    if (form.id === "wave-assignment-form") {
      const ids = [...form.elements.registration_ids.selectedOptions].map((option) => option.value);
      if (!ids.length) throw new Error("Select at least one participant");
      const result = await wavesAction("assign", {
        eventId: form.dataset.eventId,
        waveId: data.get("wave_id"),
        registrationIds: ids,
      });
      await refresh(form.dataset.eventId);
      showNotice(`${result.assigned} runners assigned.`);
      return true;
    }
    if (form.id === "runner-wave-form") {
      await wavesAction("assign_self", {
        eventId: form.dataset.eventId,
        registrationId: form.dataset.registrationId,
        waveId: data.get("wave_id"),
        estimatedPaceSeconds: data.get("estimated_pace")
          ? Math.round(parseResultTime(data.get("estimated_pace")) / 1000)
          : null,
      });
      dialog.close();
      await go("runner");
      showNotice("Your start wave was updated.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
