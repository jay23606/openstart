import assert from "node:assert/strict";
import test from "node:test";
import { createNoticeController } from "../modules/ui-feedback.js";

test("notice controller replaces messages and exposes errors as alerts", () => {
  const classes = new Set(["hidden"]);
  const message = { textContent: "" };
  const button = { addEventListener() {} };
  const attributes = {};
  const notice = {
    dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    querySelector: (selector) => selector === "span" ? message : button,
    setAttribute: (name, value) => { attributes[name] = value; },
  };
  const controller = createNoticeController({ notice, defaultDuration: 0 });

  controller.show("Saved");
  assert.equal(message.textContent, "Saved");
  assert.equal(attributes.role, "status");
  assert.equal(classes.has("hidden"), false);

  controller.show("Payment failed", { type: "error", duration: 0 });
  assert.equal(message.textContent, "Payment failed");
  assert.equal(attributes.role, "alert");
  assert.equal(notice.dataset.type, "error");
});
