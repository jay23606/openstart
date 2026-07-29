import assert from "node:assert/strict";
import test from "node:test";
import { createVolunteersController } from "../features/volunteers/controller.js";

function fixture(signupStatus = "confirmed") {
  const actions = [];
  const notices = [];
  const opened = [];
  const controller = createVolunteersController({
    eventById: (id) => ({ id }),
    openDialog: (content) => opened.push(content),
    forms: {
      opportunities: (event) => `opportunities:${event.id}`,
      signup: (event, shift) => `signup:${event.id}:${shift}`,
      manager: (event) => `manager:${event.id}`,
    },
    exportVolunteers: (event) => actions.push({ export: event.id }),
    joinVolunteerShift: async (payload) => {
      actions.push({ signup: payload });
      return { status: signupStatus };
    },
    createVolunteerRole: async () => {},
    updateVolunteerSignup: async () => {},
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    dialog: { close: () => actions.push({ close: true }) },
    showNotice: (message) => notices.push(message),
  });
  return { actions, controller, notices, opened };
}

const target = (dataset) => ({ dataset });

test("public volunteer actions open the correct feature views", async () => {
  const { controller, opened } = fixture();
  assert.equal(await controller.handleClick(target({ volunteer: "event-1" })), true);
  assert.equal(await controller.handleClick(target({
    volunteerShift: "shift-1",
    event: "event-1",
  })), true);
  assert.deepEqual(opened, ["opportunities:event-1", "signup:event-1:shift-1"]);
});

test("full shifts produce an explicit waitlist confirmation", async () => {
  const { controller, notices } = fixture("waitlisted");
  const values = new Map([
    ["first_name", "Ada"],
    ["last_name", "Runner"],
    ["email", "ada@example.com"],
    ["waiver", "on"],
  ]);
  assert.equal(await controller.handleSubmit(
    { id: "volunteer-signup-form", dataset: { shiftId: "shift-1" } },
    { get: (name) => values.get(name) },
  ), true);
  assert.deepEqual(notices, ["That shift is full, so you joined its waitlist."]);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, new Map()), false);
});
