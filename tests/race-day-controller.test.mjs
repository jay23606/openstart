import assert from "node:assert/strict";
import test from "node:test";
import { createRaceDayController } from "../features/race-day/controller.js";

function fixture() {
  const actions = [];
  const notices = [];
  const opened = [];
  const controller = createRaceDayController({
    state: { runnerRegistrations: [{ id: "registration-1" }] },
    eventById: (id) => ({ id }),
    openDialog: (content) => opened.push(content),
    forms: {
      manager: (event) => `race-day:${event.id}`,
      pass: (item) => `pass:${item.id}`,
    },
    raceDayAction: async (action, payload) => {
      actions.push({ action, payload });
      return action === "lookup" ? { registrations: [{ id: "registration-1" }] } : {};
    },
    updateOrderItem: async (id) => actions.push({ fulfill: id }),
    startQrScanner: async (id) => actions.push({ scanner: id }),
    exportRoster: (event) => actions.push({ roster: event.id }),
    loadAndExportFinancials: async () => actions.push({ finance: true }),
    raceDayResults: (items) => `rows:${items.length}`,
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    showNotice: (message) => notices.push(message),
  });
  return { actions, controller, notices, opened };
}

const target = (dataset, selector = "") => ({
  dataset,
  disabled: false,
  textContent: "",
  matches: (candidate) => candidate === selector,
});

test("packet pickup is recorded once and locks its control", async () => {
  const { actions, controller, notices } = fixture();
  const button = target({ pickup: "registration-1" });
  assert.equal(await controller.handleClick(button), true);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "\u2713 Packet");
  assert.deepEqual(actions, [{
    action: "pickup",
    payload: { registrationId: "registration-1" },
  }]);
  assert.deepEqual(notices, ["Packet pickup recorded."]);
});

test("race-day lookup renders only returned registrations", async () => {
  const { controller } = fixture();
  const output = { innerHTML: "" };
  const values = new Map([["term", "Ada"]]);
  assert.equal(await controller.handleSubmit({
    id: "race-day-lookup-form",
    dataset: { eventId: "event-1" },
    parentElement: { querySelector: () => output },
  }, { get: (name) => values.get(name) }), true);
  assert.equal(output.innerHTML, "rows:1");
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, new Map()), false);
});
