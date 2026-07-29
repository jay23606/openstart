import assert from "node:assert/strict";
import test from "node:test";
import { createRegistrationController } from "../features/registration/controller.js";

function controllerFixture(session = null) {
  const state = { session, lotteryApplications: [], registrations: [], runnerRegistrations: [] };
  const opened = [];
  const actions = [];
  const controller = createRegistrationController({
    state,
    eventById: (id) => ({ id }),
    openDialog: (content) => opened.push(content),
    forms: {
      auth: () => "auth",
      registration: (event) => `registration:${event.id}`,
      lotteryApplication: (event) => `lottery:${event.id}`,
    },
    participantFields: () => "",
    showNotice: () => {},
    withdrawLotteryApplication: async () => {},
    registrationAction: async (action, payload) => { actions.push({ action, payload }); return {}; },
    resendConfirmation: async () => {},
    loadRunnerDashboard: async () => {},
    go: async (view) => actions.push({ view }),
    dialog: { close() {} },
  });
  return { actions, controller, opened, state };
}

const target = (dataset) => ({ dataset, matches: () => false });

test("registration actions open the feature-owned registration flow", async () => {
  const { controller, opened } = controllerFixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), true);
  assert.deepEqual(opened, ["registration:event-1"]);
});

test("lottery entry preserves intent while authentication is required", async () => {
  const { controller, opened, state } = controllerFixture();
  assert.equal(await controller.handleClick(target({ applyLottery: "event-2" })), true);
  assert.deepEqual(opened, ["auth"]);
  assert.equal(state.pendingLotteryEvent, "event-2");
  assert.equal(state.pendingView, "discover");
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = controllerFixture();
  assert.equal(await controller.handleClick(target({ createEvent: "" })), false);
});

test("runner registration submissions stay inside the feature controller", async () => {
  const { actions, controller } = controllerFixture({ user: { id: "runner" } });
  const values = new Map([
    ["first_name", "Ada"],
    ["last_name", "Lovelace"],
    ["emergency_contact", "Charles"],
  ]);
  const handled = await controller.handleSubmit(
    { id: "runner-registration-form", dataset: { registrationId: "registration-1" } },
    { get: (name) => values.get(name) },
  );

  assert.equal(handled, true);
  assert.deepEqual(actions[0], {
    action: "runner_update",
    payload: {
      registrationId: "registration-1",
      firstName: "Ada",
      lastName: "Lovelace",
      emergencyContact: "Charles",
    },
  });
  assert.deepEqual(actions[1], { view: "runner" });
});

test("tier changes clear and constrain wave choices", () => {
  const { controller } = controllerFixture();
  const options = [
    { dataset: { tier: "" }, hidden: false },
    { dataset: { tier: "short" }, hidden: false },
    { dataset: { tier: "long" }, hidden: false },
  ];
  const waveSelect = { value: "wave-1", options };
  const tier = {
    value: "long",
    matches: (selector) => selector === "[data-field='tier_id']",
    closest: () => ({ querySelector: () => waveSelect }),
  };

  assert.equal(controller.handleChange(tier), true);
  assert.equal(waveSelect.value, "");
  assert.deepEqual(options.map((option) => option.hidden), [false, true, false]);
});
