import assert from "node:assert/strict";
import test from "node:test";
import { createDemoController } from "../features/demo/controller.js";

function target(dataset = {}, selector = "") {
  return { dataset, disabled: false, matches: (value) => value === selector };
}

function fixture(overrides = {}) {
  const state = { pendingView: "runner" };
  const actions = [];
  const controller = createDemoController({
    state,
    openDialog: (markup) => actions.push(["dialog", markup]),
    authForm: () => "auth",
    createShowcaseEvent: async () => actions.push(["create"]),
    deleteShowcaseEvent: async (id) => actions.push(["delete", id]),
    loadDashboard: async () => actions.push(["load"]),
    renderDemo: () => actions.push(["render-demo"]),
    renderDashboard: () => actions.push(["render-dashboard"]),
    renderRoster: (race) => actions.push(["roster", race.id]),
    hydrateEvent: async (id) => ({ id, name: "Showcase" }),
    showNotice: (message, options) => actions.push(["notice", message, options]),
    confirmAction: () => true,
    scrollToBottom: () => actions.push(["scroll"]),
    launchers: {
      results: (race) => actions.push(["results", race.id]),
    },
    ...overrides,
  });
  return { controller, state, actions };
}

test("demo controller opens authentication and creates a private showcase", async () => {
  const { controller, state, actions } = fixture();

  assert.equal(await controller.handleClick(target({}, "[data-demo-sign-in]")), true);
  assert.equal(state.pendingView, "demo");
  const createButton = target({}, "[data-create-showcase]");
  assert.equal(await controller.handleClick(createButton), true);
  assert.equal(createButton.disabled, true);
  assert.deepEqual(actions, [
    ["dialog", "auth"],
    ["create"],
    ["load"],
    ["render-demo"],
    ["notice", "Your private showcase is ready.", undefined],
  ]);
});

test("demo controller restores failed creation controls and reports persistent errors", async () => {
  const { controller, actions } = fixture({
    createShowcaseEvent: async () => { throw new Error("No showcase"); },
  });
  const button = target({}, "[data-create-showcase]");

  assert.equal(await controller.handleClick(button), true);
  assert.equal(button.disabled, false);
  assert.deepEqual(actions, [["notice", "No showcase", { type: "error", duration: 0 }]]);
});

test("demo controller removes, opens, and launches hydrated showcase tools", async () => {
  const { controller, actions } = fixture();

  assert.equal(await controller.handleClick(target({ deleteShowcase: "demo-1" })), true);
  assert.equal(await controller.handleClick(target({ demoRoster: "demo-2" })), true);
  assert.equal(await controller.handleClick(target({ demoFeature: "results", eventIdDemo: "demo-3" })), true);
  assert.equal(await controller.handleClick(target()), false);
  assert.deepEqual(actions, [
    ["delete", "demo-1"],
    ["load"],
    ["render-demo"],
    ["notice", "Showcase removed. Your real events were not changed.", undefined],
    ["render-dashboard"],
    ["roster", "demo-2"],
    ["scroll"],
    ["results", "demo-3"],
  ]);
});
