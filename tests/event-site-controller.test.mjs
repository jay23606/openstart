import assert from "node:assert/strict";
import test from "node:test";
import { createEventSiteController } from "../features/event-site/controller.js";

test("site preview closes the editor and renders the draft", async () => {
  const actions = [];
  const controller = createEventSiteController({
    state: { session: { user: { id: "organizer" } } },
    eventById: (id) => ({ id }),
    openDialog: () => {},
    siteEditorForm: () => "",
    updateEventSettings: async () => {},
    createEventSection: async () => {},
    createEventSponsor: async () => {},
    deleteEventSection: async () => {},
    deleteEventSponsor: async () => {},
    uploadEventAsset: async () => "",
    loadDashboard: async () => {},
    dialog: { close: () => actions.push("close") },
    renderEvent: (event, preview) => actions.push(`${event.id}:${preview}`),
    showNotice: () => {},
  });
  assert.equal(await controller.handleClick({ dataset: { previewSite: "event-1" } }), true);
  assert.deepEqual(actions, ["close", "event-1:true"]);
});
