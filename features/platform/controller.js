export function createPlatformController({
  state,
  openDialog,
  forms,
  platformAdminAction,
  loadPlatformOverview,
  renderPlatformAdmin,
  dialog,
  showNotice,
}) {
  async function refresh() {
    await loadPlatformOverview();
    renderPlatformAdmin();
  }

  async function handleClick(target) {
    if (target.dataset.platformSuspend) {
      const item = state.platformData.events.find((entry) => entry.id === target.dataset.platformSuspend);
      if (item) openDialog(forms.suspension(item));
      return true;
    }
    if (target.dataset.platformRestore) {
      if (!confirm("Restore this event to its previous public availability?")) return true;
      await platformAdminAction("restore_event", { eventId: target.dataset.platformRestore });
      await refresh();
      showNotice("Event restored.");
      return true;
    }
    if (target.dataset.platformEventFee) {
      const item = state.platformData.events.find((entry) => entry.id === target.dataset.platformEventFee);
      if (item) openDialog(forms.fee(item));
      return true;
    }
    if (target.dataset.platformEventNote) {
      const item = state.platformData.events.find((entry) => entry.id === target.dataset.platformEventNote);
      if (item) openDialog(forms.note({ eventId: item.id, label: item.name }));
      return true;
    }
    if (target.dataset.platformOrganizerNote) {
      const item = state.platformData.organizers.find((entry) => entry.id === target.dataset.platformOrganizerNote);
      if (item) openDialog(forms.note({ organizerId: item.id, label: item.display_name || item.email }));
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "platform-search-form") {
      await loadPlatformOverview(String(data.get("query") || ""));
      renderPlatformAdmin();
      return true;
    }
    if (form.id === "platform-default-fee-form") {
      await platformAdminAction("update_fees", {
        feeBps: Math.round(Number(data.get("fee_percent")) * 100),
      });
      await refresh();
      showNotice("Default platform fee updated.");
      return true;
    }
    if (form.id === "platform-event-fee-form") {
      await platformAdminAction("update_fees", {
        eventId: form.dataset.eventId,
        feeBps: Math.round(Number(data.get("fee_percent")) * 100),
      });
      dialog.close();
      await refresh();
      showNotice("Event fee updated.");
      return true;
    }
    if (form.id === "platform-suspend-form") {
      await platformAdminAction("suspend_event", {
        eventId: form.dataset.eventId,
        reason: data.get("reason"),
      });
      dialog.close();
      await refresh();
      showNotice("Event suspended and new registrations blocked.");
      return true;
    }
    if (form.id === "platform-note-form") {
      await platformAdminAction("add_note", {
        eventId: data.get("event_id") || null,
        organizerId: data.get("organizer_id") || null,
        note: data.get("note"),
      });
      dialog.close();
      await refresh();
      showNotice("Private support note saved.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
