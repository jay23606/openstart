import assert from "node:assert/strict";
import test from "node:test";
import { createLotteryController } from "../features/lottery/controller.js";

function fixture({ confirmDraw = true, drawError = null } = {}) {
  const actions = [];
  const opened = [];
  const notices = [];
  const controller = createLotteryController({
    state: { session: { user: { id: "organizer-1" } } },
    eventById: (id) => ({ id }),
    openDialog: (content) => opened.push(content),
    lifecycleForm: (event) => `lottery:${event.id}`,
    lotteryAction: async (action, payload) => {
      actions.push({ action, payload });
      if (drawError) throw drawError;
      return { selected: 2, emailsSent: 2, emailsFailed: 0 };
    },
    updateEventSettings: async (id, payload) => actions.push({ updateEventSettings: id, payload }),
    reviewLotteryApplication: async (id, payload) => actions.push({ review: id, payload }),
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    showNotice: (message, options) => notices.push({ message, options }),
    confirmDraw: () => confirmDraw,
  });
  return { actions, controller, notices, opened };
}

const target = (dataset) => ({ dataset, disabled: false });

test("cancelled lottery draw confirmation has no side effects", async () => {
  const { actions, controller } = fixture({ confirmDraw: false });
  const button = target({ runLottery: "event-1" });
  assert.equal(await controller.handleClick(button), true);
  assert.equal(button.disabled, false);
  assert.deepEqual(actions, []);
});

test("a successful draw stays locked and refreshes the lifecycle", async () => {
  const { actions, controller, notices, opened } = fixture();
  const button = target({ runLottery: "event-1" });
  assert.equal(await controller.handleClick(button), true);
  assert.equal(button.disabled, true);
  assert.deepEqual(actions, [
    { action: "draw", payload: { eventId: "event-1" } },
    { loadDashboard: true },
  ]);
  assert.deepEqual(opened, ["lottery:event-1"]);
  assert.match(notices[0].message, /2 selected/);
});

test("draw failures restore the control and show a persistent error", async () => {
  const { controller, notices } = fixture({ drawError: new Error("Already finalized") });
  const button = target({ runLottery: "event-1" });
  assert.equal(await controller.handleClick(button), true);
  assert.equal(button.disabled, false);
  assert.deepEqual(notices, [{
    message: "Already finalized",
    options: { type: "error", duration: 0 },
  }]);
});

test("invalid lottery windows are rejected before persistence", async () => {
  const { actions, controller } = fixture();
  const values = new Map([
    ["lottery_opens_at", "2026-08-02T12:00"],
    ["lottery_closes_at", "2026-08-01T12:00"],
    ["registration_mode", "lottery"],
    ["lottery_spots", "10"],
  ]);
  await assert.rejects(
    controller.handleSubmit(
      { id: "lottery-settings-form", dataset: { eventId: "event-1" } },
      { get: (name) => values.get(name) },
    ),
    /closing time must be after opening time/,
  );
  assert.deepEqual(actions, []);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, new Map()), false);
});
