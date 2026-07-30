import assert from "node:assert/strict";
import test from "node:test";
import { createConflictController, overlappingChanges } from "../modules/conflicts.js";

test("overlappingChanges distinguishes mergeable and conflicting fields", () => {
  const base = { name: "Old", location_name: "Richmond" };
  const draft = { name: "Mine", location_name: "Richmond" };
  assert.deepEqual(overlappingChanges(base, draft, {
    name: "Theirs",
    location_name: "Norfolk",
  }), ["name"]);
  assert.deepEqual(overlappingChanges(base, { name: "Mine" }, {
    name: "Old",
    location_name: "Norfolk",
  }), []);
});

test("conflict controller automatically retries non-overlapping event changes", async () => {
  const calls = [];
  const notices = [];
  const latest = { id: "event-1", name: "Old", location_name: "Norfolk", updated_at: "v2" };
  const controller = createConflictController({
    updateEventSettings: async (_id, changes, options) => {
      calls.push(options.expectedUpdatedAt);
      if (calls.length === 1) throw Object.assign(new Error("stale"), { code: "OS_STALE_WRITE", latest });
      return { ...latest, ...changes, updated_at: "v3" };
    },
    openDialog: () => assert.fail("mergeable changes should not open a dialog"),
    closeDialog: () => {},
    showNotice: (message) => notices.push(message),
  });
  const result = await controller.updateEvent({
    eventId: "event-1",
    expectedUpdatedAt: "v1",
    base: { name: "Old", location_name: "Richmond" },
    changes: { name: "Mine" },
  });
  assert.equal(result.status, "merged");
  assert.deepEqual(calls, ["v1", "v2"]);
  assert.match(notices[0], /merged/);
});

test("conflict controller requires a choice for overlapping fields", async () => {
  const opened = [];
  const saves = [];
  const latest = { id: "event-1", name: "Theirs", updated_at: "v2" };
  const controller = createConflictController({
    updateEventSettings: async (_id, changes, options) => {
      if (options.expectedUpdatedAt === "v1") {
        throw Object.assign(new Error("stale"), { code: "OS_STALE_WRITE", latest });
      }
      return { ...latest, ...changes, updated_at: "v3" };
    },
    openDialog: (markup) => opened.push(markup),
    closeDialog: () => {},
    showNotice: () => {},
  });
  const result = await controller.updateEvent({
    eventId: "event-1",
    expectedUpdatedAt: "v1",
    base: { name: "Old" },
    changes: { name: "Mine" },
    onSaved: (event) => saves.push(event),
  });
  assert.equal(result.status, "conflict");
  assert.match(opened[0], /Your draft/);
  assert.equal(await controller.handleClick({
    dataset: { conflictAction: "overwrite" },
    disabled: false,
  }), true);
  assert.equal(saves[0].name, "Mine");
});
