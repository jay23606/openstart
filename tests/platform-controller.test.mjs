import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformController } from "../features/platform/controller.js";

function fixture() {
  const actions = [];
  const opened = [];
  const notices = [];
  const controller = createPlatformController({
    state: {
      platformData: {
        events: [{ id: "event-1", name: "Trail Run" }],
        organizers: [{ id: "organizer-1", email: "owner@example.com" }],
      },
    },
    openDialog: (content) => opened.push(content),
    forms: {
      suspension: (event) => `suspend:${event.id}`,
      fee: (event) => `fee:${event.id}`,
      note: ({ eventId, organizerId }) => `note:${eventId || organizerId}`,
    },
    platformAdminAction: async (action, payload) => actions.push({ action, payload }),
    loadPlatformOverview: async (query) => actions.push({ query }),
    renderPlatformAdmin: () => actions.push({ render: true }),
    dialog: { close: () => actions.push({ close: true }) },
    showNotice: (message) => notices.push(message),
  });
  return { actions, controller, notices, opened };
}

const target = (dataset) => ({ dataset });

test("platform event controls open feature-owned dialogs", async () => {
  const { controller, opened } = fixture();

  assert.equal(await controller.handleClick(target({ platformSuspend: "event-1" })), true);
  assert.equal(await controller.handleClick(target({ platformEventFee: "event-1" })), true);
  assert.equal(await controller.handleClick(target({ platformOrganizerNote: "organizer-1" })), true);
  assert.deepEqual(opened, ["suspend:event-1", "fee:event-1", "note:organizer-1"]);
});

test("platform fee submissions stay inside the feature controller", async () => {
  const { actions, controller, notices } = fixture();
  const handled = await controller.handleSubmit(
    { id: "platform-event-fee-form", dataset: { eventId: "event-1" } },
    { get: () => "4.25" },
  );

  assert.equal(handled, true);
  assert.deepEqual(actions, [
    { action: "update_fees", payload: { eventId: "event-1", feeBps: 425 } },
    { close: true },
    { query: undefined },
    { render: true },
  ]);
  assert.deepEqual(notices, ["Event fee updated."]);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, new Map()), false);
});
