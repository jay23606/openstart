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

test("named actions create bounded metadata-only history", () => {
  let timestamp = 100;
  const store = createStore({ session: null, view: "discover" }, {
    historyLimit: 2,
    now: () => timestamp++,
  });
  const metadata = [];
  store.subscribe(null, (_state, _changes, meta) => metadata.push(meta));

  store.patch({ session: { access_token: "secret" } }, "auth.signed-in");
  store.patch({ view: "runner" }, "route.navigate");
  store.patch({ session: null }, "auth.signed-out");

  assert.deepEqual(metadata.map((item) => item.action), [
    "auth.signed-in",
    "route.navigate",
    "auth.signed-out",
  ]);
  assert.deepEqual(store.getHistory(), [
    { at: 101, action: "route.navigate", keys: ["view"] },
    { at: 102, action: "auth.signed-out", keys: ["session"] },
  ]);
  assert.doesNotMatch(JSON.stringify(store.getHistory()), /secret/);
  store.clearHistory();
  assert.deepEqual(store.getHistory(), []);
});

test("strict stores reject misspelled and deleted state keys", () => {
  const store = createStore({ view: "discover" });
  assert.throws(() => { store.state.veiw = "runner"; }, /Unknown state key: veiw/);
  assert.throws(() => { delete store.state.view; }, /State keys cannot be deleted: view/);
  assert.equal(store.state.view, "discover");
});

test("selectors react only when their derived value changes", () => {
  const store = createStore({ session: null, view: "discover", events: [] });
  const selected = [];
  const unsubscribe = store.select(
    (state) => `${state.view}:${Boolean(state.session)}`,
    (value, previous) => selected.push([value, previous]),
    { immediate: true },
  );

  store.patch({ events: [{ id: "race" }] }, "events.loaded");
  store.patch({ view: "runner" }, "route.navigate");
  store.patch({ session: { user: { id: "runner" } } }, "auth.signed-in");
  unsubscribe();
  store.patch({ view: "discover" }, "route.navigate");

  assert.deepEqual(selected, [
    ["discover:false", undefined],
    ["runner:false", "discover:false"],
    ["runner:true", "runner:false"],
  ]);
});
