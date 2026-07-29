import assert from "node:assert/strict";
import test from "node:test";
import { createRouter, normalizeView, routeUrl } from "../modules/router.js";

test("normalizeView accepts known routes and rejects unknown routes", () => {
  assert.equal(normalizeView("demo"), "demo");
  assert.equal(normalizeView("missing"), "discover");
  assert.equal(normalizeView(null), "discover");
});

test("routeUrl persists top-level views and clears stale detail routes", () => {
  assert.equal(
    routeUrl("https://example.test/openstart/?series=abc&payment=success", "runner"),
    "/openstart/?payment=success&view=runner",
  );
  assert.equal(
    routeUrl("https://example.test/openstart/?view=help&athlete=runner", "discover"),
    "/openstart/",
  );
});

test("createRouter never commits a stale asynchronous route", async () => {
  const state = { navigationId: 0, session: null };
  const rendered = [];
  let releaseSlow;
  const slow = new Promise((resolve) => { releaseSlow = resolve; });
  const { navigate } = createRouter({
    state,
    configured: false,
    routes: {
      discover: async () => () => rendered.push("discover"),
      slow: async () => {
        await slow;
        return () => rendered.push("slow");
      },
    },
    protectedViews: [],
    onAuthRequired: () => {},
    afterNavigate: () => {},
  });

  const staleNavigation = navigate("slow", { syncUrl: false });
  await navigate("discover", { syncUrl: false });
  releaseSlow();
  await staleNavigation;

  assert.deepEqual(rendered, ["discover"]);
});

test("router batches view and selection transitions atomically", async () => {
  const state = { navigationId: 0, session: {}, selectedEvent: { id: "old" }, view: "discover" };
  const transitions = [];
  const { navigate } = createRouter({
    state,
    configured: true,
    routes: { runner: async () => null },
    protectedViews: [],
    onAuthRequired: () => {},
    afterNavigate: () => {},
    batchState: (action) => {
      transitions.push("start");
      action();
      transitions.push([state.navigationId, state.view, state.selectedEvent]);
    },
  });

  await navigate("runner", { syncUrl: false });
  assert.deepEqual(transitions, ["start", [1, "runner", null]]);
});

test("router labels protected and completed transitions", async () => {
  const state = { navigationId: 0, session: null };
  const actions = [];
  const router = createRouter({
    state,
    configured: true,
    routes: { runner: async () => null, discover: async () => null },
    onAuthRequired: () => {},
    afterNavigate: () => {},
    actionState: (name, operation) => {
      actions.push(name);
      operation();
    },
  });

  await router.navigate("runner", { syncUrl: false });
  state.session = {};
  await router.navigate("discover", { syncUrl: false });
  assert.deepEqual(actions, ["route.auth-required", "route.navigate"]);
});
