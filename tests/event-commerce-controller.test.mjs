import assert from "node:assert/strict";
import test from "node:test";
import { createEventCommerceController } from "../features/event-commerce/controller.js";

function fixture() {
  const actions = [];
  const opened = [];
  const controller = createEventCommerceController({
    eventById: (id) => ({ id, os_event_questions: [] }),
    openDialog: (content) => opened.push(content),
    forms: {
      registration: (event) => `registration:${event.id}`,
      pricing: (event) => `pricing:${event.id}`,
      products: (event) => `products:${event.id}`,
    },
    updateEventSettings: async () => {},
    createEventQuestion: async () => {},
    deleteEventQuestion: async (id) => actions.push({ deleteQuestion: id }),
    createScheduledPrice: async () => {},
    createPromoCode: async (payload) => actions.push({ promo: payload }),
    createProduct: async () => {},
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    showNotice: (message) => actions.push({ notice: message }),
  });
  return { actions, controller, opened };
}

test("deleting a registration question refreshes its settings", async () => {
  const { actions, controller, opened } = fixture();
  assert.equal(await controller.handleClick({
    dataset: { deleteQuestion: "question-1", eventId: "event-1" },
  }), true);
  assert.deepEqual(actions, [
    { deleteQuestion: "question-1" },
    { loadDashboard: true },
    { notice: "Question removed." },
  ]);
  assert.deepEqual(opened, ["registration:event-1"]);
});

test("promo codes are normalized before persistence", async () => {
  const { actions, controller } = fixture();
  const values = new Map([
    ["code", " summer10 "],
    ["discount_type", "percent"],
    ["value", "10"],
  ]);
  assert.equal(await controller.handleSubmit(
    { id: "promo-form", dataset: { eventId: "event-1" } },
    { get: (name) => values.get(name) },
  ), true);
  assert.equal(actions[0].promo.code, "SUMMER10");
  assert.equal(actions[0].promo.discount_value, 1000);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick({ dataset: { register: "event-1" } }), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, new Map()), false);
});
