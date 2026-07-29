import assert from "node:assert/strict";
import test from "node:test";
import { createBusyController } from "../modules/busy.js";

test("busy controller blocks duplicates and restores form controls", () => {
  const attributes = new Map();
  const button = { disabled: false, dataset: {}, tagName: "BUTTON", textContent: "Save" };
  const form = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    querySelectorAll: () => [button],
  };
  const busy = createBusyController();
  const release = busy.begin(form, button);

  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Processing...");
  assert.equal(attributes.get("aria-busy"), "true");
  assert.equal(busy.begin(form, button), null);

  release();
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Save");
  assert.equal(attributes.has("aria-busy"), false);
});

test("busy controller can remain locked during an external redirect", () => {
  const attributes = new Map();
  const button = { disabled: false, dataset: {}, tagName: "BUTTON", textContent: "Pay" };
  const form = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    querySelectorAll: () => [button],
  };
  const release = createBusyController().begin(form, button);

  release({ keepBusy: true });

  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Processing...");
  assert.equal(attributes.get("aria-busy"), "true");
});
