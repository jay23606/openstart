export function createLotteryController({
  state,
  eventById,
  openDialog,
  lifecycleForm,
  lotteryAction,
  updateEventSettings,
  reviewLotteryApplication,
  loadDashboard,
  showNotice,
  confirmDraw,
}) {
  async function refresh(eventId) {
    await loadDashboard();
    openDialog(lifecycleForm(eventById(eventId)));
  }

  async function handleClick(target) {
    if (target.dataset.lotteryManager) {
      openDialog(lifecycleForm(eventById(target.dataset.lotteryManager)));
      return true;
    }
    if (!target.dataset.runLottery) return false;
    if (!confirmDraw()) return true;

    target.disabled = true;
    try {
      const result = await lotteryAction("draw", { eventId: target.dataset.runLottery });
      await refresh(target.dataset.runLottery);
      const emailSummary = result.emailsFailed
        ? `${result.emailsSent} invitations sent \u00b7 ${result.emailsFailed} email delivery failures`
        : `${result.emailsSent} invitations sent`;
      showNotice(`Draw finalized: ${result.selected} selected \u00b7 ${emailSummary}.`);
    } catch (error) {
      target.disabled = false;
      showNotice(error.message || "The lottery draw could not be completed.", { type: "error", duration: 0 });
    }
    return true;
  }

  async function handleSubmit(form, data) {
    if (form.id === "lottery-settings-form") {
      const opens = data.get("lottery_opens_at");
      const closes = data.get("lottery_closes_at");
      if (opens && closes && new Date(opens) >= new Date(closes)) {
        throw new Error("Lottery closing time must be after opening time.");
      }
      if (data.get("registration_mode") === "lottery" && !data.get("lottery_spots")) {
        throw new Error("Enter the number of available lottery spots.");
      }
      await updateEventSettings(form.dataset.eventId, {
        registration_mode: data.get("registration_mode"),
        lottery_spots: data.get("lottery_spots") ? Number(data.get("lottery_spots")) : null,
        lottery_opens_at: opens ? new Date(opens).toISOString() : null,
        lottery_closes_at: closes ? new Date(closes).toISOString() : null,
        qualifier_required: data.get("qualifier_required") === "on",
        qualifier_instructions: data.get("qualifier_instructions").trim(),
        lottery_invitation_hours: Number(data.get("lottery_invitation_hours")) || 48,
      });
      await refresh(form.dataset.eventId);
      showNotice("Lottery settings saved.");
      return true;
    }
    if (form.matches?.(".lottery-review-form")) {
      await reviewLotteryApplication(form.dataset.applicationId, {
        status: data.get("status"),
        bonus_tickets: Number(data.get("bonus_tickets")) || 0,
        review_notes: data.get("review_notes").trim(),
        reviewed_by: state.session.user.id,
      });
      await refresh(form.dataset.eventId);
      showNotice("Application review saved.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
