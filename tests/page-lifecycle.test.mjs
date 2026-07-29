import assert from "node:assert/strict";
import test from "node:test";
import { createPageLifecycle } from "../modules/page-lifecycle.js";

test("page lifecycle commits metadata and markup before optional browser effects", () => {
  const actions = [];
  const page = {
    innerHTML: "",
    focus: (options) => actions.push(["focus", options]),
  };
  const lifecycle = createPageLifecycle({
    page,
    setPageMetadata: (...values) => actions.push(["metadata", ...values]),
    syncNavigation: () => actions.push(["sync"]),
    scrollToTop: () => actions.push(["scroll"]),
  });

  const rendered = lifecycle.render("<main>Race</main>", {
    metadata: { title: "Race", description: "Details", image: "race.png" },
    sync: true,
    scroll: true,
    focus: true,
  });

  assert.equal(rendered, page);
  assert.equal(page.innerHTML, "<main>Race</main>");
  assert.deepEqual(actions, [
    ["metadata", "Race", "Details", "race.png"],
    ["sync"],
    ["scroll"],
    ["focus", { preventScroll: true }],
  ]);
});

test("page lifecycle leaves metadata and browser position untouched by default", () => {
  const actions = [];
  const page = { innerHTML: "", focus: () => actions.push("focus") };
  const lifecycle = createPageLifecycle({
    page,
    setPageMetadata: () => actions.push("metadata"),
    syncNavigation: () => actions.push("sync"),
    scrollToTop: () => actions.push("scroll"),
  });

  lifecycle.render("<main>Updated</main>");

  assert.equal(page.innerHTML, "<main>Updated</main>");
  assert.deepEqual(actions, []);
});

test("afterNavigate and fatal errors use one consistent focus and navigation policy", () => {
  const actions = [];
  const page = { innerHTML: "", focus: () => actions.push("focus") };
  const lifecycle = createPageLifecycle({
    page,
    setPageMetadata: (title) => actions.push(`metadata:${title}`),
    syncNavigation: () => actions.push("sync"),
    scrollToTop: () => actions.push("scroll"),
  });

  lifecycle.afterNavigate();
  lifecycle.error("<section>Failed</section>");

  assert.equal(page.innerHTML, "<section>Failed</section>");
  assert.deepEqual(actions, [
    "sync",
    "focus",
    "metadata:OpenStart could not load",
    "sync",
    "focus",
  ]);
});
