import assert from "node:assert/strict";
import test from "node:test";
import { createFormStateController } from "../modules/form-state.js";

function fixture({ saved = null, confirmResult = true } = {}) {
  const values = new Map(saved ? [["openstart:draft:setup:event:basics", JSON.stringify(saved)]] : []);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const status = { textContent: "", dataset: {} };
  const input = { name: "name", type: "text", value: "Original", disabled: false };
  const checkbox = { name: "published", type: "checkbox", value: "on", checked: false, disabled: false };
  const form = {
    dataset: { draftKey: "setup:event:basics" },
    elements: [input, checkbox],
    querySelector: () => status,
    contains: (item) => item === form,
  };
  input.closest = checkbox.closest = () => form;
  const root = {
    querySelectorAll: () => [form],
    contains: (item) => item === form,
  };
  const listeners = new Map();
  const controller = createFormStateController({
    storage,
    confirmDiscard: () => confirmResult,
    windowRef: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    },
  });
  return { checkbox, controller, form, input, listeners, root, status, values };
}

test("form state captures, restores, and clears a draft", () => {
  const first = fixture();
  first.controller.hydrate(first.root);
  first.input.value = "Draft";
  assert.equal(first.controller.capture(first.input), true);
  assert.equal(first.controller.hasUnsavedChanges, true);
  assert.equal(first.status.textContent, "Unsaved changes");
  const saved = JSON.parse(first.values.get("openstart:draft:setup:event:basics"));

  const restored = fixture({ saved });
  restored.controller.hydrate(restored.root);
  assert.equal(restored.input.value, "Draft");
  assert.equal(restored.controller.hasUnsavedChanges, true);
  restored.controller.markSaved(restored.form);
  assert.equal(restored.controller.hasUnsavedChanges, false);
  assert.equal(restored.values.size, 0);
});

test("form state blocks navigation and browser unload while dirty", () => {
  const blocked = fixture({ confirmResult: false });
  blocked.controller.hydrate(blocked.root);
  blocked.checkbox.checked = true;
  blocked.controller.capture(blocked.checkbox);
  assert.equal(blocked.controller.confirmLeave(blocked.root), false);
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  blocked.listeners.get("beforeunload")(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, "");

  const accepted = fixture({ confirmResult: true });
  accepted.controller.hydrate(accepted.root);
  accepted.input.value = "Changed";
  accepted.controller.capture(accepted.input);
  assert.equal(accepted.controller.confirmLeave(accepted.root), true);
  assert.equal(accepted.controller.hasUnsavedChanges, false);
});

test("form state ignores non-draft forms", () => {
  const { controller } = fixture();
  assert.equal(controller.capture({ closest: () => null }), false);
});
