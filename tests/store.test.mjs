import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "../modules/store.js";

test("store subscriptions react only to their selected top-level keys", () => {
  const store = createStore({ view: "discover", session: null, events: [] });
  const calls = [];
  store.subscribe(["view", "session"], (_state, changes) => calls.push(changes));

  store.state.events = [{ id: "race-1" }];
  store.state.view = "runner";
  store.state.view = "runner";

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [{ key: "view", previous: "discover", value: "runner" }]);
});

test("store patches batch related state transitions into one notification", () => {
  const store = createStore({ session: { id: "runner" }, registrations: [1], platformAdmin: { allowed: true } });
  const calls = [];
  store.subscribe(null, (state, changes) => calls.push({ state: { ...state }, changes }));

  store.patch({ session: null, registrations: [], platformAdmin: null });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].changes.map((change) => change.key), ["session", "registrations", "platformAdmin"]);
  assert.equal(calls[0].state.session, null);
});

test("nested batches preserve the original value and publish the final value", () => {
  const store = createStore({ count: 0 });
  const calls = [];
  store.subscribe("count", (_state, changes) => calls.push(changes));

  store.batch(() => {
    store.state.count = 1;
    store.batch(() => {
      store.state.count = 2;
    });
  });

  assert.deepEqual(calls, [[{ key: "count", previous: 0, value: 2 }]]);
});

test("subscriptions can initialize a browser effect and unsubscribe cleanly", () => {
  const store = createStore({ view: "discover" });
  let calls = 0;
  const unsubscribe = store.subscribe("view", () => { calls += 1; }, { immediate: true });
  unsubscribe();
  store.state.view = "runner";
  assert.equal(calls, 1);
});
