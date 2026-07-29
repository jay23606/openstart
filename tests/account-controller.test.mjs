import assert from "node:assert/strict";
import test from "node:test";
import { createAccountController } from "../features/account/controller.js";

function button(selector = "", dataset = {}) {
  return { dataset, disabled: false, textContent: "", matches: (value) => value === selector };
}

function fixture(overrides = {}) {
  const state = { session: { user: { id: "runner" } }, athleteProfile: { handle: "runner" } };
  const actions = [];
  const locationRef = {
    origin: "https://example.test",
    pathname: "/openstart/",
    assign: (url) => actions.push(["assign", url]),
  };
  const controller = createAccountController({
    state,
    accountAction: async (action) => action === "export" ? { profile: true } : actions.push(["account", action]),
    beginStripeOnboarding: async (url) => {
      actions.push(["stripe-return", url]);
      return "https://connect.stripe.test";
    },
    getAthleteProfile: async (handle) => ({ profile: { handle }, results: [] }),
    eventById: (id) => ({ id, name: "Race" }),
    openDialog: (markup) => actions.push(["dialog", markup]),
    healthForm: (value) => `health:${value}`,
    embedSnippetForm: (race) => `embed:${race.id}`,
    athleteProfileForm: (profile) => `athlete:${profile.handle}`,
    downloadJson: (filename, value) => actions.push(["download", filename, value]),
    showNotice: (message, options) => actions.push(["notice", message, options]),
    go: async (view) => actions.push(["go", view]),
    renderAthlete: (athlete) => actions.push(["athlete", athlete.profile.handle]),
    confirmAction: () => true,
    documentRef: { querySelector: () => null },
    clipboard: null,
    locationRef,
    historyRef: { replaceState: (...values) => actions.push(["history", ...values]) },
    today: () => "2026-07-29",
    authApi: {
      signUp: async (credentials) => ({ data: { session: { user: credentials } }, error: null }),
      signInWithPassword: async (credentials) => ({ data: { session: { user: credentials } }, error: null }),
      signOut: async () => actions.push(["signout"]),
    },
    loadPlatformAccess: async () => actions.push(["platform"]),
    closeDialog: () => actions.push(["close"]),
    loadPublic: async () => actions.push(["public"]),
    hydrateEvent: async (id) => ({ id }),
    renderEvent: (race) => actions.push(["event", race.id]),
    afterNavigate: () => actions.push(["navigate"]),
    lotteryApplicationForm: (race) => `lottery:${race.id}`,
    saveAthleteProfile: async (payload) => payload,
    renderRunnerDashboard: () => actions.push(["runner"]),
    authForm: () => "auth-form",
    ...overrides,
  });
  return { controller, state, actions, locationRef };
}

function form(id) {
  const message = { textContent: "" };
  return { id, message, querySelector: () => message };
}

function formData(values) {
  return { get: (name) => values[name] ?? null };
}

test("account controller exports and deletes account data through explicit confirmations", async () => {
  const { controller, state, actions } = fixture();

  assert.equal(await controller.handleClick(button("[data-export-account]")), true);
  assert.equal(await controller.handleClick(button("[data-delete-account]")), true);
  assert.equal(state.session, null);
  assert.deepEqual(actions, [
    ["download", "openstart-data-2026-07-29.json", { profile: true }],
    ["notice", "Your OpenStart data export was downloaded.", undefined],
    ["account", "delete"],
    ["go", "discover"],
    ["notice", "Your account was deleted and participant data was anonymized.", undefined],
  ]);
});

test("account controller opens embed and athlete surfaces", async () => {
  const { controller, actions } = fixture();

  assert.equal(await controller.handleClick(button("", { embedCode: "race-1" })), true);
  assert.equal(await controller.handleClick(button("[data-edit-athlete]")), true);
  assert.equal(await controller.handleClick(button("", { viewAthlete: "runner" })), true);
  assert.deepEqual(actions, [
    ["dialog", "embed:race-1"],
    ["dialog", "athlete:runner"],
    ["history", {}, "", "/openstart/?athlete=runner"],
    ["athlete", "runner"],
  ]);
});

test("account controller copies embeds and starts Stripe onboarding", async () => {
  const actions = [];
  const textarea = { value: "<script>", select: () => actions.push(["select"]) };
  const { controller } = fixture({
    documentRef: { querySelector: () => textarea },
    clipboard: { writeText: async (value) => actions.push(["copy", value]) },
    showNotice: (message) => actions.push(["notice", message]),
    beginStripeOnboarding: async (url) => {
      actions.push(["stripe", url]);
      return "https://connect.stripe.test";
    },
    locationRef: {
      origin: "https://example.test",
      pathname: "/openstart/",
      assign: (url) => actions.push(["assign", url]),
    },
  });

  assert.equal(await controller.handleClick(button("[data-copy-embed]")), true);
  const stripeButton = button("[data-connect-stripe]");
  assert.equal(await controller.handleClick(stripeButton), true);
  assert.equal(stripeButton.disabled, true);
  assert.deepEqual(actions, [
    ["select"],
    ["copy", "<script>"],
    ["notice", "Embed code copied."],
    ["stripe", "https://example.test/openstart/?stripe=return"],
    ["assign", "https://connect.stripe.test"],
  ]);
});

test("account controller restores Stripe controls after provider failures", async () => {
  const { controller, actions } = fixture({
    beginStripeOnboarding: async () => { throw new Error("Stripe unavailable"); },
  });
  const stripeButton = button("[data-connect-stripe]");

  assert.equal(await controller.handleClick(stripeButton), true);
  assert.equal(stripeButton.disabled, false);
  assert.deepEqual(actions, [
    ["notice", "Stripe unavailable", { type: "error", duration: 0 }],
    ["go", "dashboard"],
  ]);
});

test("account controller signs in and returns to the pending runner view", async () => {
  const { controller, state, actions } = fixture();
  state.pendingView = "runner";

  assert.equal(await controller.handleSubmit(
    form("auth-form"),
    formData({ email: "runner@example.com", password: "secret" }),
    { value: "signin" },
  ), true);
  assert.equal(state.session.user.email, "runner@example.com");
  assert.deepEqual(actions, [
    ["platform"],
    ["close"],
    ["go", "runner"],
  ]);
});

test("account controller resumes a pending lottery after authentication", async () => {
  const { controller, state, actions } = fixture();
  state.pendingLotteryEvent = "race-1";

  assert.equal(await controller.handleSubmit(
    form("auth-form"),
    formData({ email: "runner@example.com", password: "secret" }),
    { value: "signin" },
  ), true);
  assert.equal(state.pendingLotteryEvent, null);
  assert.equal(state.selectedEvent.id, "race-1");
  assert.deepEqual(actions, [
    ["platform"],
    ["close"],
    ["public"],
    ["event", "race-1"],
    ["navigate"],
    ["dialog", "lottery:race-1"],
  ]);
});

test("account controller normalizes athlete profiles and explains duplicate handles", async () => {
  const saved = [];
  const success = fixture({
    saveAthleteProfile: async (payload) => {
      saved.push(payload);
      return payload;
    },
  });
  assert.equal(await success.controller.handleSubmit(
    form("athlete-profile-form"),
    formData({
      handle: "  TrailRunner ",
      display_name: " Runner ",
      location: " Richmond ",
      bio: " Bio ",
      is_public: "on",
    }),
  ), true);
  assert.deepEqual(saved, [{
    handle: "trailrunner",
    display_name: "Runner",
    location: "Richmond",
    bio: "Bio",
    is_public: true,
  }]);

  const failed = fixture({
    saveAthleteProfile: async () => { throw new Error("unique constraint"); },
  });
  const failedForm = form("athlete-profile-form");
  assert.equal(await failed.controller.handleSubmit(failedForm, formData({ handle: "taken" })), true);
  assert.equal(failedForm.message.textContent, "That handle is already taken. Try another.");
});

test("account entry and sign-out reset session-owned state", async () => {
  const { controller, state, actions } = fixture();
  state.platformAdmin = { id: "admin" };
  state.registrations = [{ id: "registration" }];
  state.loadedRegistrationEvents = new Set(["race-1"]);

  controller.requestSignIn();
  assert.equal(state.pendingView, "runner");
  assert.deepEqual(actions, [["dialog", "auth-form"]]);

  await controller.signOut();
  assert.equal(state.session, null);
  assert.equal(state.platformAdmin, null);
  assert.deepEqual(state.registrations, []);
  assert.equal(state.loadedRegistrationEvents.size, 0);
  assert.deepEqual(actions.slice(1), [
    ["signout"],
    ["go", "discover"],
  ]);
});

test("account entry explains missing backend configuration", () => {
  const { controller, actions } = fixture({ configured: false });
  controller.requestSignIn();
  assert.deepEqual(actions, [
    ["notice", "Add Supabase credentials in config.js to enable accounts.", undefined],
  ]);
});
