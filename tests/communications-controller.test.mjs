import assert from "node:assert/strict";
import test from "node:test";
import { createCommunicationsController } from "../features/communications/controller.js";

function fixture({ confirmSend = true } = {}) {
  const actions = [];
  const opened = [];
  const notices = [];
  const preview = { innerHTML: "" };
  const controller = createCommunicationsController({
    state: { session: { user: { id: "organizer-1" } } },
    openDialog: (content) => opened.push(content),
    campaignForm: () => "campaign-form",
    communicationsAction: async (action, payload) => {
      actions.push({ action, payload });
      return { count: 2, sample: ["runner@example.com"] };
    },
    createEmailTemplate: async (payload) => actions.push({ template: payload }),
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    showNotice: (message) => notices.push(message),
    escapeHtml: (value) => value,
    dialog: { close: () => actions.push({ close: true }) },
    go: async (view) => actions.push({ view }),
    confirmSend: () => confirmSend,
  });
  const values = new Map([
    ["audience_type", "confirmed"],
    ["event_id", "event-1"],
    ["name", "Race update"],
    ["message_type", "transactional"],
    ["subject", "Important update"],
    ["html_body", "<p>Hello</p>"],
    ["scheduled_at", ""],
  ]);
  const form = {
    id: "campaign-form",
    querySelector: () => preview,
  };
  const data = { get: (name) => values.get(name) };
  return { actions, controller, data, form, notices, opened, preview, values };
}

test("campaign composer is owned by the communications controller", async () => {
  const { controller, opened } = fixture();
  const handled = await controller.handleClick({
    matches: (selector) => selector === "[data-compose-campaign]",
  });
  assert.equal(handled, true);
  assert.deepEqual(opened, ["campaign-form"]);
});

test("each campaign submitter maps to only its selected action", async () => {
  const { actions, controller, data, form, preview } = fixture();
  assert.equal(await controller.handleSubmit(form, data, { value: "preview" }), true);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, "preview");
  assert.match(preview.innerHTML, /2 recipients/);

  actions.length = 0;
  assert.equal(await controller.handleSubmit(form, data, { value: "test" }), true);
  assert.deepEqual(actions.map((item) => item.action), ["test"]);
});

test("cancelled immediate sends never call the campaign API", async () => {
  const { actions, controller, data, form } = fixture({ confirmSend: false });
  assert.equal(await controller.handleSubmit(form, data, { value: "send" }), true);
  assert.deepEqual(actions, []);
});

test("draft and immediate-send intents carry distinct create flags", async () => {
  const draft = fixture();
  await draft.controller.handleSubmit(draft.form, draft.data, { value: "save" });
  assert.equal(draft.actions[0].action, "create");
  assert.equal(draft.actions[0].payload.sendNow, false);

  const immediate = fixture();
  await immediate.controller.handleSubmit(immediate.form, immediate.data, { value: "send" });
  assert.equal(immediate.actions[0].action, "create");
  assert.equal(immediate.actions[0].payload.sendNow, true);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller, data } = fixture();
  assert.equal(await controller.handleClick({ matches: () => false }), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, data), false);
});
