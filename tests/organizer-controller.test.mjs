import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizerController } from "../features/organizer/controller.js";

function fixture() {
  const opened = [];
  const notices = [];
  const waitlistUpdates = [];
  const state = { setupEventId: null };
  const rows = [
    { dataset: { search: "ada runner@example.com", status: "confirmed" }, classList: { hidden: false, toggle(_name, value) { this.hidden = value; } } },
    { dataset: { search: "grace other@example.com", status: "pending" }, classList: { hidden: false, toggle(_name, value) { this.hidden = value; } } },
  ];
  const fields = new Map([
    ['[data-roster-search="event-1"]', { value: "ada" }],
    ['[data-roster-status="event-1"]', { value: "confirmed" }],
  ]);
  const controller = createOrganizerController({
    state,
    eventById: (id) => ({ id, status: "draft", os_event_checklist_items: [] }),
    openDialog: (value) => opened.push(value),
    forms: { event: () => "event-form" },
    renderSetupWizard: async () => {},
    renderDashboard: () => {},
    renderRoster: () => {},
    renderEvent: () => {},
    loadDashboard: async () => {},
    publishEvent: async () => {},
    unpublishEvent: async () => {},
    updateChecklistItem: async () => {},
    deleteChecklistItem: async () => {},
    deleteEventSection: async () => {},
    deleteEventSponsor: async () => {},
    deleteScheduledPrice: async () => {},
    deleteWave: async () => {},
    wavesAction: async () => ({}),
    createEvent: async () => ({ id: "created" }),
    duplicateEvent: async () => {},
    createChecklistItem: async () => {},
    createEventTier: async () => {},
    updateEventSettings: async () => {},
    slugify: (value) => value.toLowerCase().replaceAll(" ", "-"),
    organizerId: () => "organizer",
    dialog: { close() {} },
    showNotice: (message) => notices.push(message),
    go: async () => {},
    updateWaitlist: async (id, changes) => waitlistUpdates.push([id, changes]),
    documentRef: {
      querySelector: (selector) => fields.get(selector),
      querySelectorAll: () => rows,
    },
  });
  return { controller, notices, opened, rows, waitlistUpdates };
}

test("organizer actions open event creation without leaking into app.js", async () => {
  const { controller, opened } = fixture();
  const handled = await controller.handleClick({
    dataset: {},
    matches: (selector) => selector === "[data-create-event]",
  });
  assert.equal(handled, true);
  assert.deepEqual(opened, ["event-form"]);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick({ dataset: {}, matches: () => false }), false);
});

test("organizer roster filters and waitlist changes are feature-owned", async () => {
  const { controller, notices, rows, waitlistUpdates } = fixture();
  assert.equal(controller.handleInput({ dataset: { rosterSearch: "event-1" } }), true);
  assert.equal(rows[0].classList.hidden, false);
  assert.equal(rows[1].classList.hidden, true);

  assert.equal(await controller.handleChange({ dataset: { waitlistId: "wait-1" }, value: "invited" }), true);
  assert.equal(waitlistUpdates[0][0], "wait-1");
  assert.equal(waitlistUpdates[0][1].status, "invited");
  assert.match(waitlistUpdates[0][1].invited_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(notices, ["Waitlist status updated."]);
});
