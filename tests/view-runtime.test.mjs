import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "../modules/store.js";
import { mountReactiveView, shallowEqual } from "../modules/view-runtime.js";

test("reactive views render selected state and ignore unrelated changes", () => {
  const store = createStore({ count: 0, events: [] });
  const updates = [];
  const component = mountReactiveView({
    store,
    target: { name: "counter" },
    select: (state) => state.count,
    render: (count) => `Count: ${count}`,
    update: (target, output) => updates.push([target.name, output]),
  });

  store.patch({ events: [{ id: "race" }] }, "events.loaded");
  store.patch({ count: 1 }, "counter.changed");

  assert.deepEqual(updates, [
    ["counter", "Count: 0"],
    ["counter", "Count: 1"],
  ]);
  assert.equal(component.mounted, true);
});

test("reactive views clean up effects during refresh and disposal", () => {
  const store = createStore({ value: "first" });
  const effects = [];
  const component = mountReactiveView({
    store,
    target: {},
    select: (state) => state.value,
    update: (_target, value) => {
      effects.push(`mount:${value}`);
      return () => effects.push(`cleanup:${value}`);
    },
  });

  store.patch({ value: "second" }, "value.changed");
  component.refresh();
  component.dispose();
  store.patch({ value: "third" }, "value.changed");

  assert.equal(component.mounted, false);
  assert.deepEqual(effects, [
    "mount:first",
    "cleanup:first",
    "mount:second",
    "cleanup:second",
    "mount:second",
    "cleanup:second",
  ]);
});

test("shallow equality supports small derived component models", () => {
  assert.equal(shallowEqual({ view: "runner", signedIn: true }, { view: "runner", signedIn: true }), true);
  assert.equal(shallowEqual({ view: "runner" }, { view: "discover" }), false);
  assert.equal(shallowEqual(null, {}), false);
});
