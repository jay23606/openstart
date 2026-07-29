import assert from "node:assert/strict";
import test from "node:test";
import { createShellController } from "../modules/shell-controller.js";

function button(selector = "", dataset = {}) {
  return { dataset, matches: (value) => value === selector };
}

function fixture(overrides = {}) {
  const state = { view: "discover", setupEventId: null };
  const actions = [];
  const events = new Map([["race-1", { id: "race-1" }]]);
  const rosterSlot = { innerHTML: "roster" };
  const controller = createShellController({
    state,
    eventById: (id) => events.get(id),
    ensureEventRegistrations: async (id) => actions.push(["hydrate", id]),
    renderSetupWizard: async (race, step) => actions.push(["setup", race.id, step]),
    go: async (view) => actions.push(["go", view]),
    dispatchFeatureClick: async (target) => target.dataset.feature === "yes",
    resetDemo: () => actions.push(["reset"]),
    showNotice: (message) => actions.push(["notice", message]),
    documentRef: { querySelector: () => rosterSlot },
    historyRef: { replaceState: (...values) => actions.push(["history", ...values]) },
    locationRef: { pathname: "/openstart/" },
    ...overrides,
  });
  return { controller, state, actions, rosterSlot };
}

test("shell navigation claims one route action and preserves the selected view", async () => {
  const { controller, actions } = fixture();

  assert.equal(await controller.handleClick(button("[data-view]", { view: "runner" })), true);
  assert.deepEqual(actions, [["go", "runner"]]);
});

test("back actions resume active setup before returning to discovery", async () => {
  const active = fixture();
  active.state.setupEventId = "race-1";
  assert.equal(await active.controller.handleClick(button("[data-action='discover'], [data-back]")), true);
  assert.deepEqual(active.actions, [["setup", "race-1", 5]]);

  const inactive = fixture();
  assert.equal(await inactive.controller.handleClick(button("[data-action='discover'], [data-back]")), true);
  assert.deepEqual(inactive.actions, [
    ["history", {}, "", "/openstart/"],
    ["go", "discover"],
  ]);
});

test("dashboard event actions hydrate once before feature dispatch", async () => {
  const { controller, state, actions } = fixture();
  state.view = "dashboard";

  assert.equal(await controller.handleClick(button("", { feature: "yes", eventId: "race-1" })), true);
  assert.deepEqual(actions, [["hydrate", "race-1"]]);
});

test("shell-owned transient controls close rosters and reset demos", async () => {
  const { controller, actions, rosterSlot } = fixture();

  assert.equal(await controller.handleClick(button("[data-close-roster]")), true);
  assert.equal(rosterSlot.innerHTML, "");
  assert.equal(await controller.handleClick(button("[data-reset-demo]")), true);
  assert.deepEqual(actions, [
    ["reset"],
    ["go", "dashboard"],
    ["notice", "Demo data restored."],
  ]);
});
