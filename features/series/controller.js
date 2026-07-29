export function createSeriesController({
  state,
  openDialog,
  forms,
  renderSeries,
  exportStandings,
  createSeries,
  updateSeries,
  addSeriesEvent,
  removeSeriesEvent,
  loadDashboard,
  slugify,
  dialog,
  showNotice,
  replaceUrl,
  scrollToTop,
}) {
  const seriesById = (id) => state.series.find((series) => series.id === id);

  async function refreshSettings(seriesId) {
    await loadDashboard();
    openDialog(forms.settings(seriesById(seriesId)));
  }

  async function handleClick(target) {
    if (target.matches("[data-series-manager]")) {
      openDialog(forms.manager());
      return true;
    }
    if (target.dataset.configureSeries) {
      openDialog(forms.settings(seriesById(target.dataset.configureSeries)));
      return true;
    }
    if (target.dataset.viewSeries) {
      dialog.close();
      replaceUrl(target.dataset.viewSeries);
      await renderSeries(seriesById(target.dataset.viewSeries));
      scrollToTop();
      return true;
    }
    if (target.dataset.exportSeries) {
      exportStandings(seriesById(target.dataset.exportSeries));
      return true;
    }
    if (target.dataset.removeSeriesEvent) {
      await removeSeriesEvent(target.dataset.removeSeriesEvent);
      await refreshSettings(target.dataset.series);
      showNotice("Event removed from series.");
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "series-form") {
      const name = data.get("name");
      const created = await createSeries({
        organizer_id: state.session.user.id,
        name,
        slug: `${slugify(name)}-${Date.now().toString().slice(-6)}`,
        description: data.get("description"),
        minimum_events: Number(data.get("minimum_events")),
        tie_breaker: data.get("tie_breaker"),
      });
      await refreshSettings(created.id);
      showNotice("Race series created.");
      return true;
    }
    if (form.id === "series-settings-form") {
      const points = String(data.get("points_schedule"))
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0);
      if (!points.length) throw new Error("Enter at least one placement point value");
      await updateSeries(form.dataset.seriesId, {
        description: data.get("description"),
        primary_color: data.get("primary_color"),
        status: data.get("status"),
        minimum_events: Number(data.get("minimum_events")),
        tie_breaker: data.get("tie_breaker"),
        points_schedule: points,
        participation_points: Number(data.get("participation_points")),
        logo_url: data.get("logo_url") || null,
        banner_url: data.get("banner_url") || null,
        updated_at: new Date().toISOString(),
      });
      await refreshSettings(form.dataset.seriesId);
      showNotice("Series settings saved.");
      return true;
    }
    if (form.id === "series-event-form") {
      if (!data.get("event_id")) throw new Error("Choose an event to add");
      const series = seriesById(form.dataset.seriesId);
      await addSeriesEvent({
        series_id: series.id,
        event_id: data.get("event_id"),
        points_multiplier: Number(data.get("points_multiplier")),
        sort_order: (series.os_series_events || []).length,
      });
      await refreshSettings(series.id);
      showNotice("Event added to series.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
