export function createCommunicationsController({
  state,
  openDialog,
  campaignForm,
  communicationsAction,
  createEmailTemplate,
  loadDashboard,
  showNotice,
  escapeHtml,
  dialog,
  go,
  confirmSend,
}) {
  async function handleClick(target) {
    if (!target.matches("[data-compose-campaign]")) return false;
    openDialog(campaignForm());
    return true;
  }

  async function handleSubmit(form, data, submitter) {
    if (form.id !== "campaign-form") return false;

    const intent = submitter?.value || "preview";
    const audience = {
      type: data.get("audience_type"),
      tierId: data.get("tier_id") || null,
      waveId: data.get("wave_id") || null,
      teamId: data.get("team_id") || null,
    };
    const common = {
      eventId: data.get("event_id"),
      audience,
      subject: data.get("subject"),
      htmlBody: data.get("html_body"),
    };

    if (intent === "template") {
      await createEmailTemplate({
        organizer_id: state.session.user.id,
        name: data.get("name"),
        subject: data.get("subject"),
        html_body: data.get("html_body"),
      });
      await loadDashboard();
      showNotice("Email template saved.");
      return true;
    }
    if (intent === "preview") {
      const result = await communicationsAction("preview", common);
      form.querySelector("#audience-preview").innerHTML = `<b>${result.count} recipients</b>${
        result.sample?.length ? `<span>${result.sample.map(escapeHtml).join(", ")}</span>` : ""
      }`;
      return true;
    }
    if (intent === "test") {
      await communicationsAction("test", common);
      showNotice("Test email sent to your account.");
      return true;
    }
    if (intent === "send" && !confirmSend()) return true;

    const scheduledAt = data.get("scheduled_at");
    await communicationsAction("create", {
      ...common,
      name: data.get("name"),
      messageType: data.get("message_type"),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      sendNow: intent === "send",
    });
    dialog.close();
    await go("dashboard");
    showNotice(
      intent === "send"
        ? "Campaign sending started."
        : scheduledAt
          ? "Campaign scheduled."
          : "Campaign saved as a draft.",
    );
    return true;
  }

  function handleChange(target) {
    if (target.name !== "template_id") return false;
    const template = state.emailTemplates.find((item) => item.id === target.value);
    if (!template) return true;
    const form = target.closest("form");
    form.elements.subject.value = template.subject;
    form.elements.html_body.value = template.html_body;
    return true;
  }

  return { handleClick, handleSubmit, handleChange };
}
