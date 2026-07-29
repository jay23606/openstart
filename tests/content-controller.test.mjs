import assert from "node:assert/strict";
import test from "node:test";
import { createContentController } from "../features/content/controller.js";

function classList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    toggle: (value, force) => force ? values.add(value) : values.delete(value),
  };
}

function fixture() {
  const filters = [
    { dataset: { helpFilter: "All" }, classList: classList(["active"]) },
    { dataset: { helpFilter: "Runners" }, classList: classList() },
    { dataset: { helpFilter: "Organizers" }, classList: classList() },
  ];
  const articles = [
    { dataset: { helpAudience: "Runners", helpSearchable: "runner stripe checkout" }, classList: classList() },
    { dataset: { helpAudience: "Runners", helpSearchable: "runner results" }, classList: classList() },
    { dataset: { helpAudience: "Organizers", helpSearchable: "organizer stripe payouts" }, classList: classList() },
  ];
  const search = { value: "" };
  const count = { textContent: "" };
  const documentRef = {
    querySelector: (selector) => selector === "[data-help-search]" ? search : selector === ".help-count" ? count : null,
    querySelectorAll: (selector) => {
      if (selector === "[data-help-filter]") return filters;
      if (selector === "[data-help-article]") return articles;
      if (selector === "[data-help-article]:not(.hidden)") {
        return articles.filter((article) => !article.classList.contains("hidden"));
      }
      return [];
    },
  };
  return { controller: createContentController({ documentRef }), filters, articles, search, count };
}

test("content controller filters help guides by audience and resets search", () => {
  const { controller, filters, articles, search, count } = fixture();
  search.value = "stripe";
  const runnerFilter = filters[1];
  runnerFilter.matches = (selector) => selector === "[data-help-filter]";

  assert.equal(controller.handleClick(runnerFilter), true);
  assert.equal(search.value, "");
  assert.equal(filters[0].classList.contains("active"), false);
  assert.equal(articles[0].classList.contains("hidden"), false);
  assert.equal(articles[2].classList.contains("hidden"), true);
  assert.equal(count.textContent, "2 guides");
});

test("content controller searches all guides and ignores unrelated inputs", () => {
  const { controller, filters, articles, count } = fixture();
  const searchInput = {
    value: "stripe",
    matches: (selector) => selector === "[data-help-search]",
  };

  assert.equal(controller.handleInput({ matches: () => false }), false);
  assert.equal(controller.handleInput(searchInput), true);
  assert.equal(filters[0].classList.contains("active"), true);
  assert.equal(articles[0].classList.contains("hidden"), false);
  assert.equal(articles[1].classList.contains("hidden"), true);
  assert.equal(articles[2].classList.contains("hidden"), false);
  assert.equal(count.textContent, "2 guides");
});
