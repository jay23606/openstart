import assert from "node:assert/strict";
import test from "node:test";
import { mountRunnerDashboardComponent } from "../modules/runner-dashboard-component.js";
import { createStore } from "../modules/store.js";

function createState() {
  return {
    runnerRegistrations: [],
    captainTeams: [],
    volunteerSignups: [],
    lotteryApplications: [],
    athleteProfile: null,
    session: { user: { email: "runner@example.com" } },
  };
}

test("runner dashboard component replaces only its owned surface", () => {
  const store = createStore(createState());
  const replacements = [];
  const current = {
    contains: () => false,
    replaceWith: (replacement) => replacements.push(replacement.markup),
  };
  const documentRef = {
    activeElement: null,
    querySelector: (selector) => selector === "[data-runner-dashboard]" ? current : null,
    createElement: () => {
      const template = { content: {} };
      Object.defineProperty(template, "innerHTML", {
        set(markup) {
          template.content.querySelector = () => ({ markup });
        },
      });
      return template;
    },
  };
  const component = mountRunnerDashboardComponent({
    store,
    accountViews: {
      runnerDashboard: (state) => `registrations:${state.runnerRegistrations.length}`,
    },
    documentRef,
  });
  replacements.length = 0;
  store.patch({ runnerRegistrations: [{ id: "registration-1" }] }, "runner.loaded");
  assert.deepEqual(replacements, ["registrations:1"]);
  component.dispose();
});

test("runner dashboard component preserves focused controls and tolerates other routes", () => {
  const store = createStore(createState());
  const focused = {};
  let visible = true;
  let replacements = 0;
  const current = {
    contains: (element) => element === focused,
    replaceWith: () => { replacements += 1; },
  };
  const component = mountRunnerDashboardComponent({
    store,
    accountViews: { runnerDashboard: () => "runner" },
    documentRef: {
      activeElement: focused,
      querySelector: () => visible ? current : null,
      createElement: () => ({
        content: { querySelector: () => ({}) },
        set innerHTML(_markup) {},
      }),
    },
  });
  replacements = 0;
  store.patch({ athleteProfile: { handle: "runner" } }, "athlete.saved");
  assert.equal(replacements, 0);
  visible = false;
  assert.doesNotThrow(() => store.patch({ captainTeams: [{ id: "team-1" }] }, "runner.loaded"));
  component.dispose();
});
