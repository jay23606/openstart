import assert from "node:assert/strict";
import test from "node:test";
import { createResultsController } from "../features/results/controller.js";

function fixture() {
  const actions = [];
  const opened = [];
  const notices = [];
  const documentRoot = {
    querySelector: () => ({ value: "bib,chip_time\n101,24:31" }),
    querySelectorAll: () => [],
  };
  const controller = createResultsController({
    eventById: (id) => ({ id }),
    openDialog: (content) => opened.push(content),
    managerForm: (event) => `results:${event.id}`,
    renderResults: (event) => actions.push({ render: event.id }),
    parseResultsCsv: () => [{ registrationId: "registration-1", chipTimeMs: 1471000 }],
    parseResultTime: (value) => value ? 1000 : null,
    resultsAction: async (action, payload) => {
      actions.push({ action, payload });
      return { email: { sent: 3, failed: 1 } };
    },
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    showNotice: (message) => notices.push(message),
    documentRoot,
  });
  return { actions, controller, documentRoot, notices, opened };
}

const target = (dataset) => ({ dataset });

test("results manager and public leaderboard are feature-owned", async () => {
  const { actions, controller, opened } = fixture();
  assert.equal(await controller.handleClick(target({ resultsManager: "event-1" })), true);
  assert.equal(await controller.handleClick(target({ viewResults: "event-1" })), true);
  assert.deepEqual(opened, ["results:event-1"]);
  assert.deepEqual(actions, [{ render: "event-1" }]);
});

test("publishing results refreshes the manager without sending email", async () => {
  const { actions, controller, notices, opened } = fixture();
  assert.equal(await controller.handleClick(target({ publishResults: "event-1" })), true);
  assert.deepEqual(actions, [
    { action: "publish", payload: { eventId: "event-1", sendEmail: false } },
    { loadDashboard: true },
  ]);
  assert.deepEqual(opened, ["results:event-1"]);
  assert.deepEqual(notices, ["Official results are now public."]);
});

test("empty manual corrections are rejected before persistence", async () => {
  const { actions, controller } = fixture();
  await assert.rejects(
    controller.handleSubmit({
      id: "results-form",
      dataset: { eventId: "event-1" },
      querySelectorAll: () => [],
    }),
    /Enter at least one finish time/,
  );
  assert.deepEqual(actions, []);
});

test("notification summaries include provider failures", async () => {
  const { controller, notices } = fixture();
  assert.equal(await controller.handleClick(target({ notifyResults: "event-1" })), true);
  assert.deepEqual(notices, ["3 result emails sent \u00b7 1 failed."]);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }), false);
});
