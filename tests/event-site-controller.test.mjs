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

test("site section drag ordering persists through the feature controller", async () => {
  const actions = [];
  const sections = [{ id: "first", title: "First" }, { id: "second", title: "Second" }];
  const race = { id: "event-1", os_event_sections: sections };
  const rows = new Map();
  const parent = {
    order: ["first", "second"],
    insertBefore(dragged, reference) {
      this.order = this.order.filter((id) => id !== dragged.dataset.siteSectionId);
      const index = reference ? this.order.indexOf(reference.dataset.siteSectionId) : this.order.length;
      this.order.splice(index, 0, dragged.dataset.siteSectionId);
    },
  };
  for (const id of parent.order) {
    rows.set(id, {
      dataset: { siteSectionId: id },
      classList: { add() {}, remove() {} },
      parentElement: parent,
      nextSibling: null,
      getBoundingClientRect: () => ({ top: 100, height: 40 }),
    });
  }
  rows.get("first").nextSibling = rows.get("second");
  const list = {
    querySelectorAll: () => parent.order.map((id) => rows.get(id)),
  };
  const controller = createEventSiteController({
    state: { events: [race] },
    eventById: () => race,
    openDialog: (markup) => actions.push(["dialog", markup]),
    siteEditorForm: () => "editor",
    loadDashboard: async () => actions.push(["load"]),
    showNotice: (message) => actions.push(["notice", message]),
    updateEventSections: async (updates) => actions.push(["update", updates]),
    documentRef: { querySelector: (selector) => rows.get(selector.match(/"([^"]+)"/)[1]) },
  });
  const firstTarget = { closest: (selector) => selector === "[data-site-section-id]" ? rows.get("first") : null };
  const secondTarget = {
    closest: (selector) => selector === "[data-site-section-id]" ? rows.get("second") : selector === "#site-section-list" ? list : null,
  };

  assert.equal(controller.handleDragStart(firstTarget), true);
  assert.equal(controller.handleDragOver(secondTarget, 130, () => actions.push(["prevent-over"])), true);
  assert.deepEqual(parent.order, ["second", "first"]);
  assert.equal(await controller.handleDrop(secondTarget, () => actions.push(["prevent-drop"])), true);
  assert.deepEqual(actions, [
    ["prevent-over"],
    ["prevent-drop"],
    ["update", [
      { id: "second", title: "Second", sort_order: 0 },
      { id: "first", title: "First", sort_order: 1 },
    ]],
    ["load"],
    ["dialog", "editor"],
    ["notice", "Section order saved."],
  ]);
});
