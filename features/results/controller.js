export function createResultsController({
  eventById,
  openDialog,
  managerForm,
  renderResults,
  parseResultsCsv,
  parseResultTime,
  resultsAction,
  loadDashboard,
  showNotice,
  documentRoot,
}) {
  async function refreshManager(eventId) {
    await loadDashboard();
    openDialog(managerForm(eventById(eventId)));
  }

  async function handleClick(target) {
    if (target.dataset.viewResults) {
      renderResults(eventById(target.dataset.viewResults));
      return true;
    }
    if (target.dataset.resultsManager) {
      openDialog(managerForm(eventById(target.dataset.resultsManager)));
      return true;
    }
    if (target.dataset.importResults) {
      const race = eventById(target.dataset.importResults);
      const rows = parseResultsCsv(documentRoot.querySelector("#results-csv").value, race);
      await resultsAction("save_many", { eventId: race.id, results: rows });
      await refreshManager(race.id);
      showNotice(`${rows.length} results imported.`);
      return true;
    }
    if (target.dataset.publishResults) {
      const eventId = target.dataset.publishResults;
      await resultsAction("publish", { eventId, sendEmail: false });
      await refreshManager(eventId);
      showNotice("Official results are now public.");
      return true;
    }
    if (target.dataset.unpublishResults) {
      const eventId = target.dataset.unpublishResults;
      await resultsAction("unpublish", { eventId });
      await refreshManager(eventId);
      showNotice("Results unpublished.");
      return true;
    }
    if (target.dataset.notifyResults) {
      const result = await resultsAction("notify", { eventId: target.dataset.notifyResults });
      showNotice(`${result.email?.sent || 0} result emails sent${
        result.email?.failed ? ` \u00b7 ${result.email.failed} failed` : ""
      }.`);
      return true;
    }
    return false;
  }

  async function handleSubmit(form) {
    if (form.id !== "results-form") return false;
    const results = [...form.querySelectorAll(".result-entry")]
      .map((row) => ({
        registrationId: row.dataset.registrationId,
        chipTimeMs: parseResultTime(row.querySelector('[name="chip_time"]').value),
        gunTimeMs: parseResultTime(row.querySelector('[name="gun_time"]').value),
        status: row.querySelector('[name="result_status"]').value,
        division: row.querySelector('[name="division"]').value || null,
      }))
      .filter((item) => item.status !== "finisher" || item.chipTimeMs !== null || item.gunTimeMs !== null);
    if (!results.length) throw new Error("Enter at least one finish time or non-finisher status");
    await resultsAction("save_many", { eventId: form.dataset.eventId, results });
    await refreshManager(form.dataset.eventId);
    showNotice(`${results.length} results saved.`);
    return true;
  }

  async function handleChange(target) {
    if (target.id !== "results-csv-file" || !target.files?.[0]) return false;
    const text = await target.files[0].text();
    const textarea = documentRoot.querySelector("#results-csv");
    if (textarea) textarea.value = text;
    return true;
  }

  function handleInput(target) {
    if (!target.matches("[data-results-search],[data-results-tier]")) return false;
    const search = (documentRoot.querySelector("[data-results-search]")?.value || "").trim().toLowerCase();
    const tier = documentRoot.querySelector("[data-results-tier]")?.value || "";
    documentRoot.querySelectorAll(".result-row").forEach((row) => {
      row.classList.toggle(
        "hidden",
        Boolean(search && !row.dataset.resultSearch.includes(search))
          || Boolean(tier && row.dataset.resultTier !== tier),
      );
    });
    return true;
  }

  return { handleClick, handleSubmit, handleChange, handleInput };
}
