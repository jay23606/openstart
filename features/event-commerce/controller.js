export function createEventCommerceController({
  eventById,
  openDialog,
  forms,
  updateEventSettings,
  createEventQuestion,
  deleteEventQuestion,
  createScheduledPrice,
  createPromoCode,
  createProduct,
  loadDashboard,
  showNotice,
  updateEventWithConflict = null,
  markFormSaved = () => {},
}) {
  async function refresh(eventId, form) {
    await loadDashboard();
    openDialog(form(eventById(eventId)));
  }

  async function saveVersionedSettings(form, changes, view, notice) {
    const base = eventById(form.dataset.eventId);
    const finish = async () => {
      markFormSaved(form);
      await refresh(form.dataset.eventId, view);
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
        await refresh(form.dataset.eventId, view);
      },
      onKeep: async () => openDialog(view(base)),
    });
  }

  async function handleClick(target) {
    if (!target.dataset.deleteQuestion) return false;
    await deleteEventQuestion(target.dataset.deleteQuestion);
    await refresh(target.dataset.eventId, forms.registration);
    showNotice("Question removed.");
    return true;
  }

  async function handleSubmit(form, data) {
    if (form.id === "registration-settings-form") {
      const asIso = (name) => data.get(name) ? new Date(data.get(name)).toISOString() : null;
      await saveVersionedSettings(form, {
        waiver_text: data.get("waiver_text") || "",
        participant_edits_close_at: asIso("participant_edits_close_at"),
        transfers_close_at: asIso("transfers_close_at"),
        refunds_close_at: asIso("refunds_close_at"),
        allow_transfers: data.get("allow_transfers") === "on",
        allow_refund_requests: data.get("allow_refund_requests") === "on",
      }, forms.registration, "Waiver settings saved.");
      return true;
    }
    if (form.id === "question-form") {
      const options = String(data.get("options") || "").split(",").map((item) => item.trim()).filter(Boolean);
      await createEventQuestion({
        event_id: form.dataset.eventId,
        label: data.get("label"),
        field_type: data.get("field_type"),
        options,
        required: data.get("required") === "on",
        sort_order: eventById(form.dataset.eventId).os_event_questions?.length || 0,
      });
      await refresh(form.dataset.eventId, forms.registration);
      showNotice("Registration question added.");
      return true;
    }
    if (form.matches?.(".scheduled-price-form")) {
      await createScheduledPrice({
        tier_id: form.dataset.tierId,
        name: data.get("name"),
        price_cents: Math.round(Number(data.get("price")) * 100),
        starts_at: new Date(data.get("starts_at")).toISOString(),
      });
      await refresh(form.dataset.eventId, forms.pricing);
      showNotice("Price change scheduled.");
      return true;
    }
    if (form.id === "promo-form") {
      await createPromoCode({
        event_id: form.dataset.eventId,
        code: String(data.get("code")).trim().toUpperCase(),
        discount_type: data.get("discount_type"),
        discount_value: Math.round(Number(data.get("value")) * 100),
        max_redemptions: data.get("max_redemptions") ? Number(data.get("max_redemptions")) : null,
        starts_at: data.get("starts_at") ? new Date(data.get("starts_at")).toISOString() : null,
        expires_at: data.get("expires_at") ? new Date(data.get("expires_at")).toISOString() : null,
      });
      await refresh(form.dataset.eventId, forms.pricing);
      showNotice("Promo code created.");
      return true;
    }
    if (form.id === "product-form") {
      await createProduct({
        event_id: form.dataset.eventId,
        name: data.get("name"),
        description: data.get("description") || "",
        fulfillment_type: data.get("fulfillment_type"),
      }, {
        name: data.get("variant_name"),
        price_cents: Math.round(Number(data.get("price")) * 100),
        inventory: data.get("inventory") === "" ? null : Number(data.get("inventory")),
      });
      await refresh(form.dataset.eventId, forms.products);
      showNotice("Product created.");
      return true;
    }
    if (form.id === "donation-settings-form") {
      await updateEventSettings(form.dataset.eventId, {
        donations_enabled: data.get("donations_enabled") === "on",
        beneficiary_name: data.get("beneficiary_name") || null,
        fundraising_goal_cents: data.get("fundraising_goal")
          ? Math.round(Number(data.get("fundraising_goal")) * 100)
          : null,
      });
      await refresh(form.dataset.eventId, forms.products);
      showNotice("Fundraising settings saved.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
