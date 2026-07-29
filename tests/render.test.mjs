import assert from "node:assert/strict";
import test from "node:test";
import { emptyState, modalShell, renderList, renderMarkup } from "../modules/render.js";

const escapeHtml = (value) => String(value).replaceAll("<", "&lt;");

test("render primitives stay explicit and framework-free", () => {
  const target = { innerHTML: "" };
  assert.equal(renderMarkup(target, "<p>Ready</p>"), target);
  assert.equal(target.innerHTML, "<p>Ready</p>");
  assert.equal(renderList([1, 2], (item) => `<b>${item}</b>`), "<b>1</b><b>2</b>");
  assert.match(emptyState("<none>", escapeHtml), /&lt;none>/);
  assert.match(modalShell({
    eyebrow: "Timing",
    title: "<Race>",
    body: "<form></form>",
    wide: true,
  }, escapeHtml), /&lt;Race>/);
});
