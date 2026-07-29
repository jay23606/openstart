import assert from "node:assert/strict";
import test from "node:test";
import { normalizeView, routeUrl } from "../modules/router.js";

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
