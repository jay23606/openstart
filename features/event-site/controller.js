export function createEventSiteController({
  state,
  eventById,
  openDialog,
  siteEditorForm,
  updateEventSettings,
  createEventSection,
  createEventSponsor,
  deleteEventSection,
  deleteEventSponsor,
  uploadEventAsset,
  loadDashboard,
  dialog,
  renderEvent,
  showNotice,
  updateEventSections,
  documentRef = globalThis.document,
}) {
  let draggedSectionId = null;

  async function refresh(eventId) {
    await loadDashboard();
    openDialog(siteEditorForm(eventById(eventId)));
  }

  async function handleClick(target) {
    if (target.dataset.siteEditor) {
      openDialog(siteEditorForm(eventById(target.dataset.siteEditor)));
      return true;
    }
    if (target.dataset.previewSite) {
      const race = eventById(target.dataset.previewSite);
      dialog.close();
      renderEvent(race, true);
      showNotice("Previewing draft website content.");
      return true;
    }
    if (target.dataset.deleteSiteSection) {
      await deleteEventSection(target.dataset.deleteSiteSection);
      await refresh(target.dataset.event);
      showNotice("Section deleted.");
      return true;
    }
    if (target.dataset.deleteSponsor) {
      await deleteEventSponsor(target.dataset.deleteSponsor);
      await refresh(target.dataset.event);
      showNotice("Sponsor deleted.");
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "site-branding-form") {
      const changes = {
        primary_color: data.get("primary_color"),
        contact_email: data.get("contact_email") || null,
        website_published: data.get("website_published") === "on",
      };
      const logo = data.get("logo");
      const banner = data.get("banner");
      if (logo?.size) changes.logo_url = await uploadEventAsset(state.session.user.id, form.dataset.eventId, logo);
      if (banner?.size) changes.banner_url = await uploadEventAsset(state.session.user.id, form.dataset.eventId, banner);
      await updateEventSettings(form.dataset.eventId, changes);
      await refresh(form.dataset.eventId);
      showNotice(changes.website_published ? "Event website published." : "Website draft saved.");
      return true;
    }
    if (form.id === "site-section-form") {
      const race = eventById(form.dataset.eventId);
      await createEventSection({
        event_id: race.id,
        section_type: data.get("section_type"),
        title: data.get("title"),
        content: data.get("content"),
        link_url: data.get("link_url") || null,
        link_label: data.get("link_label") || null,
        published: data.get("published") === "on",
        sort_order: (race.os_event_sections || []).length,
      });
      await refresh(race.id);
      showNotice("Website section added.");
      return true;
    }
    if (form.id === "site-sponsor-form") {
      const logo = data.get("logo");
      const logoUrl = logo?.size
        ? await uploadEventAsset(state.session.user.id, form.dataset.eventId, logo)
        : null;
      const race = eventById(form.dataset.eventId);
      await createEventSponsor({
        event_id: race.id,
        name: data.get("name"),
        sponsor_level: data.get("sponsor_level") || "Sponsor",
        website_url: data.get("website_url") || null,
        logo_url: logoUrl,
        sort_order: (race.os_event_sponsors || []).length,
      });
      await refresh(race.id);
      showNotice("Sponsor added.");
      return true;
    }
    return false;
  }

  function handleDragStart(target) {
    const row = target.closest("[data-site-section-id]");
    if (!row) return false;
    draggedSectionId = row.dataset.siteSectionId;
    row.classList.add("dragging");
    return true;
  }

  function handleDragEnd(target) {
    target.closest("[data-site-section-id]")?.classList.remove("dragging");
    draggedSectionId = null;
  }

  function handleDragOver(target, clientY, preventDefault) {
    const row = target.closest("[data-site-section-id]");
    if (!row || !draggedSectionId || row.dataset.siteSectionId === draggedSectionId) return false;
    preventDefault();
    const dragged = documentRef.querySelector(`[data-site-section-id="${draggedSectionId}"]`);
    const box = row.getBoundingClientRect();
    row.parentElement.insertBefore(dragged, clientY < box.top + box.height / 2 ? row : row.nextSibling);
    return true;
  }

  async function handleDrop(target, preventDefault) {
    const list = target.closest("#site-section-list");
    if (!list || !draggedSectionId) return false;
    preventDefault();
    const ids = [...list.querySelectorAll("[data-site-section-id]")].map((row) => row.dataset.siteSectionId);
    const race = state.events.find((item) => item.os_event_sections?.some((section) => ids.includes(section.id)));
    if (!race) return false;
    await updateEventSections(ids.map((id, sort_order) => ({
      ...race.os_event_sections.find((section) => section.id === id),
      sort_order,
    })));
    await loadDashboard();
    openDialog(siteEditorForm(eventById(race.id)));
    showNotice("Section order saved.");
    draggedSectionId = null;
    return true;
  }

  return {
    handleClick,
    handleSubmit,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
