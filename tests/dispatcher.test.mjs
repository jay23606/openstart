import assert from "node:assert/strict";
import test from "node:test";
import { createDispatcher, handlersFrom } from "../modules/dispatcher.js";

test("dispatcher stops after the first handler accepts an action", async () => {
  const calls = [];
  const dispatch = createDispatcher([
    async () => { calls.push("first"); return false; },
    async () => { calls.push("second"); return true; },
    async () => { calls.push("third"); return true; },
  ]);

  assert.equal(await dispatch({ action: "save" }), true);
  assert.deepEqual(calls, ["first", "second"]);
});

test("dispatcher reports unhandled actions without swallowing them", async () => {
  const dispatch = createDispatcher([async () => false]);
  assert.equal(await dispatch({ action: "unknown" }), false);
});

test("handlersFrom composes only implemented controller methods", async () => {
  const calls = [];
  const controllers = [
    { handleClick() { calls.push("click"); return true; } },
    { handleSubmit() { calls.push("submit"); return true; } },
  ];
  const dispatch = createDispatcher(handlersFrom(controllers, "handleSubmit"));

  assert.equal(await dispatch(), true);
  assert.deepEqual(calls, ["submit"]);
});
