export function createVolunteersController({
  eventById,
  openDialog,
  forms,
  exportVolunteers,
  joinVolunteerShift,
  createVolunteerRole,
  updateVolunteerSignup,
  loadDashboard,
  dialog,
  showNotice,
}) {
  async function refreshManager(eventId) {
    await loadDashboard();
    openDialog(forms.manager(eventById(eventId)));
  }

  async function handleClick(target) {
    if (target.dataset.volunteer) {
      openDialog(forms.opportunities(eventById(target.dataset.volunteer)));
      return true;
    }
    if (target.dataset.volunteerShift) {
      openDialog(forms.signup(eventById(target.dataset.event), target.dataset.volunteerShift));
      return true;
    }
    if (target.dataset.exportVolunteers) {
      exportVolunteers(eventById(target.dataset.exportVolunteers));
      return true;
    }
    return false;
  }

  async function handleSubmit(form, data) {
    if (form.id === "volunteer-signup-form") {
      const signup = await joinVolunteerShift({
        shiftId: form.dataset.shiftId,
        firstName: data.get("first_name"),
        lastName: data.get("last_name"),
        email: data.get("email"),
        phone: data.get("phone"),
        emergencyContact: data.get("emergency_contact"),
        notes: data.get("notes"),
        waiverAccepted: data.get("waiver") === "on",
      });
      dialog.close();
      showNotice(
        signup.status === "waitlisted"
          ? "That shift is full, so you joined its waitlist."
          : "Your volunteer shift is confirmed.",
      );
      return true;
    }
    if (form.id === "volunteer-role-form") {
      await createVolunteerRole({
        event_id: form.dataset.eventId,
        name: data.get("name"),
        description: data.get("description"),
        requirements: data.get("requirements") || "",
        waiver_text: data.get("waiver_text") || "",
        minimum_age: data.get("minimum_age") ? Number(data.get("minimum_age")) : null,
      }, {
        starts_at: new Date(data.get("starts_at")).toISOString(),
        ends_at: new Date(data.get("ends_at")).toISOString(),
        location: data.get("location"),
        capacity: Number(data.get("capacity")),
        instructions: data.get("instructions") || "",
      });
      await refreshManager(form.dataset.eventId);
      showNotice("Volunteer role and shift created.");
      return true;
    }
    if (form.id === "volunteer-roster-form") {
      const updates = [...form.querySelectorAll("[data-volunteer-signup-id]")].map((row) => {
        const status = row.querySelector('[name="status"]').value;
        const checked = row.querySelector('[name="checked_in"]').checked;
        return updateVolunteerSignup(row.dataset.volunteerSignupId, {
          status,
          checked_in_at: checked ? new Date().toISOString() : null,
          hours_worked: row.querySelector('[name="hours"]').value === ""
            ? null
            : Number(row.querySelector('[name="hours"]').value),
          checked_out_at: status === "completed" ? new Date().toISOString() : null,
        });
      });
      await Promise.all(updates);
      await refreshManager(form.dataset.eventId);
      showNotice("Volunteer roster updated.");
      return true;
    }
    return false;
  }

  return { handleClick, handleSubmit };
}
