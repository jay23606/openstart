export function createOrganizerController({
  state,
  eventById,
  openDialog,
  forms,
  renderSetupWizard,
  renderDashboard,
  renderRoster,
  renderEvent,
  loadDashboard,
  publishEvent,
  unpublishEvent,
  updateChecklistItem,
  deleteChecklistItem,
  deleteScheduledPrice,
  createEvent,
  duplicateEvent,
  createChecklistItem,
  createEventTier,
  updateEventSettings,
  updateEventWithConflict = null,
  slugify,
  organizerId,
  dialog,
  showNotice,
  go,
  updateWaitlist,
  documentRef = globalThis.document,
  confirmLeaveDraft = () => true,
  markFormSaved = () => {},
  patchState = (values) => Object.assign(state, values),
}) {
  async function refreshDialog(eventId, form) {
    await loadDashboard();
    openDialog(form(eventById(eventId)));
  }

  async function saveSetupForm(form, changes, { currentStep, nextStep, notice }) {
    const base = eventById(form.dataset.eventId);
    const finish = async () => {
      markFormSaved(form);
      await loadDashboard();
      await renderSetupWizard(eventById(form.dataset.eventId), nextStep);
      showNotice(notice);
    };
    if (!updateEventWithConflict) {
      await updateEventSettings(form.dataset.eventId, changes);
      await finish();
      return;
    }
    await updateEventWithConflict({
      eventId: form.dataset.eventId,
      expectedUpdatedAt: base.updated_at,
      base,
      changes,
      eventName: base.name,
      onSaved: finish,
      onReload: async () => {
        markFormSaved(form);
        await loadDashboard();
        await renderSetupWizard(eventById(form.dataset.eventId), currentStep);
      },
    });
  }

  async function handleClick(target) {
    if (target.matches("[data-create-event]")) openDialog(forms.event());
    else if (target.dataset.duplicateEvent) openDialog(forms.duplicateEvent(eventById(target.dataset.duplicateEvent)));
    else if (target.dataset.roster) {
      const race = eventById(target.dataset.roster);
      if (race.status === "draft") await renderSetupWizard(race, 0);
      else renderRoster(race);
    } else if (target.dataset.openSetup) await renderSetupWizard(eventById(target.dataset.openSetup), 0);
    else if (target.dataset.setupStep) {
      if (!confirmLeaveDraft()) return true;
      await renderSetupWizard(eventById(target.dataset.setupEvent), Number(target.dataset.setupStep));
    }
    else if (target.matches("[data-exit-setup]")) {
      if (!confirmLeaveDraft()) return true;
      patchState({ setupEventId: null }, "setup.closed");
      await go("dashboard");
    } else if (target.dataset.setupPreview) {
      if (!confirmLeaveDraft()) return true;
      patchState({ setupEventId: target.dataset.setupPreview }, "setup.previewed");
      renderEvent(eventById(target.dataset.setupPreview), true);
    } else if (target.dataset.publishEvent) {
      target.disabled = true;
      try {
        await publishEvent(target.dataset.publishEvent);
        await loadDashboard();
        await renderSetupWizard(eventById(target.dataset.publishEvent), 5);
        showNotice("Event published. Registration is now public.");
      } catch (error) {
        target.disabled = false;
        showNotice(error.message || "The event is not ready to publish.");
      }
    } else if (target.dataset.unpublishEvent) {
      await unpublishEvent(target.dataset.unpublishEvent);
      await loadDashboard();
      await renderSetupWizard(eventById(target.dataset.unpublishEvent), 5);
      showNotice("Event returned to a private draft.");
    } else if (target.dataset.addParticipant) openDialog(forms.manualRegistration(eventById(target.dataset.addParticipant)));
    else if (target.dataset.registrationSettings) openDialog(forms.registrationSettings(eventById(target.dataset.registrationSettings)));
    else if (target.dataset.pricingSettings) openDialog(forms.pricingSettings(eventById(target.dataset.pricingSettings)));
    else if (target.dataset.productSettings) openDialog(forms.productSettings(eventById(target.dataset.productSettings)));
    else if (target.dataset.volunteerManager) openDialog(forms.volunteerManager(eventById(target.dataset.volunteerManager)));
    else if (target.dataset.checklist) openDialog(forms.checklist(eventById(target.dataset.checklist)));
    else if (target.dataset.toggleChecklist) {
      await updateChecklistItem(target.dataset.toggleChecklist, {
        completed_at: target.dataset.complete === "true" ? null : new Date().toISOString(),
      });
      await refreshDialog(target.dataset.event, forms.checklist);
    } else if (target.dataset.deleteChecklist) {
      if (!confirm("Delete this checklist task?")) return true;
      await deleteChecklistItem(target.dataset.deleteChecklist);
      await refreshDialog(target.dataset.event, forms.checklist);
      showNotice("Checklist task deleted.");
    } else if (target.dataset.deletePrice) {
      await deleteScheduledPrice(target.dataset.deletePrice);
      await refreshDialog(target.dataset.eventId, forms.pricingSettings);
      showNotice("Scheduled price removed.");
    } else return false;
    return true;
  }

  async function handleSubmit(form, data) {
    if (form.id === "event-form") {
      const name = data.get("name");
      const created = await createEvent({
        organizer_id: organizerId(),
        slug: `${slugify(name)}-${Date.now().toString().slice(-6)}`,
        name,
        description: data.get("description"),
        starts_at: new Date(`${data.get("date")}T12:00:00`).toISOString(),
        location_name: data.get("location"),
        status: "draft",
      }, {
        name: data.get("tier_name"),
        distance_label: data.get("distance"),
        price_cents: Math.round(Number(data.get("price")) * 100),
        capacity: Number(data.get("capacity")),
      });
      await loadDashboard();
      dialog.close();
      await renderSetupWizard(eventById(created.id), 0);
      showNotice(`${name} draft created. Your progress saves at each step.`);
      return true;
    }
    if (form.id === "duplicate-event-form") {
      const name = data.get("name").trim();
      await duplicateEvent(form.dataset.sourceEventId, name, new Date(`${data.get("date")}T12:00:00`).toISOString());
      dialog.close();
      await go("dashboard");
      showNotice(`${name} was created as a private draft.`);
      return true;
    }
    if (form.id === "checklist-item-form") {
      await createChecklistItem({
        event_id: form.dataset.eventId,
        title: data.get("title").trim(),
        category: data.get("category"),
        due_at: data.get("due_at") ? new Date(`${data.get("due_at")}T12:00:00`).toISOString() : null,
        notes: data.get("notes").trim(),
        sort_order: (eventById(form.dataset.eventId).os_event_checklist_items || []).length * 10 + 10,
      });
      await refreshDialog(form.dataset.eventId, forms.checklist);
      showNotice("Checklist task added.");
      return true;
    }
    if (form.id === "setup-basics-form") {
      await saveSetupForm(form, {
        name: data.get("name").trim(),
        starts_at: new Date(data.get("starts_at")).toISOString(),
        location_name: data.get("location_name").trim(),
        description: data.get("description").trim(),
      }, {
        currentStep: 0,
        nextStep: 1,
        notice: "Event details saved.",
      });
      return true;
    }
    if (form.id === "setup-tier-form") {
      await createEventTier({
        event_id: form.dataset.eventId,
        name: data.get("name").trim(),
        distance_label: data.get("distance_label").trim(),
        price_cents: Math.round(Number(data.get("price")) * 100),
        capacity: Number(data.get("capacity")),
      });
      markFormSaved(form);
      await loadDashboard();
      await renderSetupWizard(eventById(form.dataset.eventId), 1);
      showNotice("Registration option added.");
      return true;
    }
    if (form.id === "setup-runner-form" || form.id === "setup-website-form") {
      const runner = form.id === "setup-runner-form";
      await saveSetupForm(form, runner ? {
        waiver_text: data.get("waiver_text").trim(),
        participant_edits_close_at: data.get("participant_edits_close_at") ? new Date(data.get("participant_edits_close_at")).toISOString() : null,
        transfers_close_at: data.get("transfers_close_at") ? new Date(data.get("transfers_close_at")).toISOString() : null,
      } : {
        primary_color: data.get("primary_color"),
        contact_email: data.get("contact_email") || null,
        website_published: data.get("website_published") === "on",
      }, {
        currentStep: runner ? 2 : 3,
        nextStep: runner ? 3 : 4,
        notice: runner ? "Runner experience saved." : "Website settings saved.",
      });
      return true;
    }
    return false;
  }

  function filterRoster(eventId) {
    const search = documentRef.querySelector(`[data-roster-search="${eventId}"]`)?.value.toLowerCase() || "";
    const status = documentRef.querySelector(`[data-roster-status="${eventId}"]`)?.value || "";
    documentRef.querySelectorAll(".roster-manage [data-edit-registration]").forEach((row) => {
      row.classList.toggle("hidden", !row.dataset.search.includes(search) || (status && row.dataset.status !== status));
    });
  }

  function handleInput(target) {
    if (!target.dataset.rosterSearch) return false;
    filterRoster(target.dataset.rosterSearch);
    return true;
  }

  async function handleChange(target) {
    if (target.dataset.rosterStatus) {
      filterRoster(target.dataset.rosterStatus);
      return true;
    }
    if (target.dataset.waitlistId) {
      await updateWaitlist(target.dataset.waitlistId, {
        status: target.value,
        invited_at: target.value === "invited" ? new Date().toISOString() : null,
      });
      showNotice("Waitlist status updated.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit, handleInput, handleChange };
}
