import assert from "node:assert/strict";
import test from "node:test";
import { createWavesController } from "../features/waves/controller.js";

test("empty bulk wave assignments are rejected before persistence", async () => {
  const actions = [];
  const controller = createWavesController({
    state: { runnerRegistrations: [] },
    eventById: (id) => ({ id }),
    openDialog: () => {},
    forms: { manager: () => "", runner: () => "" },
    createWave: async () => {},
    deleteWave: async () => {},
    wavesAction: async (...args) => actions.push(args),
    parseResultTime: () => null,
    loadDashboard: async () => {},
    dialog: { close() {} },
    go: async () => {},
    showNotice: () => {},
  });
  await assert.rejects(controller.handleSubmit({
    id: "wave-assignment-form",
    dataset: { eventId: "event-1" },
    elements: { registration_ids: { selectedOptions: [] } },
  }, new Map()), /Select at least one participant/);
  assert.deepEqual(actions, []);
});
