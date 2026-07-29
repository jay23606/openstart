import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizerController } from "../features/organizer/controller.js";

function fixture() {
  const opened = [];
  const state = { setupEventId: null };
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
    showNotice: () => {},
    go: async () => {},
  });
  return { controller, opened };
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
