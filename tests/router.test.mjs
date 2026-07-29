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
