import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscoveryResultsComponent } from "../modules/discovery-results-component.js";
import { createStore } from "../modules/store.js";

function fixture() {
  const store = createStore({
    events: [{ id: "first", status: "published" }],
    discoverQuery: "",
    discoverRegion: null,
    discoverVisible: 12,
    discoverTotal: 1,
    series: [],
  });
  const results = { innerHTML: "" };
  const count = { textContent: "" };
  const search = { id: "discover-search", value: "trail" };
  const documentRef = {
    activeElement: search,
    querySelector: (selector) => selector === "#discover-results" ? results : selector === "#discover-count" ? count : null,
  };
  const publicViews = {
    discoveryModel: (state, events) => ({
      events,
      countLabel: `${state.discoverTotal} events${state.discoverQuery ? " found" : " open"}`,
    }),
    discoveryResults: (model) => `results:${model.events.map((event) => event.id).join(",")}`,
  };
  const component = mountDiscoveryResultsComponent({ store, publicViews, documentRef });
  return { component, count, documentRef, results, search, store };
}

test("discovery component updates results and count from selected state", () => {
  const { component, count, results, store } = fixture();
  assert.equal(results.innerHTML, "results:first");
  assert.equal(count.textContent, "1 events open");

  store.patch({
    events: [{ id: "second", status: "published" }, { id: "draft", status: "draft" }],
    discoverQuery: "trail",
    discoverTotal: 1,
  }, "discovery.loaded");

  assert.equal(results.innerHTML, "results:second");
  assert.equal(count.textContent, "1 events found");
  component.dispose();
});

test("discovery component preserves the active search control", () => {
  const { component, documentRef, search, store } = fixture();
  store.patch({
    events: [{ id: "next", status: "published" }],
    discoverTotal: 1,
  }, "discovery.loaded");
  assert.equal(documentRef.activeElement, search);
  component.dispose();
});

test("discovery component tolerates routes without a results target", () => {
  const store = createStore({
    events: [],
    discoverQuery: "",
    discoverRegion: null,
    discoverVisible: 12,
    discoverTotal: 0,
    series: [],
  });
  const component = mountDiscoveryResultsComponent({
    store,
    publicViews: {
      discoveryModel: () => ({ events: [], countLabel: "0 events" }),
      discoveryResults: () => "empty",
    },
    documentRef: { querySelector: () => null },
  });
  assert.doesNotThrow(() => store.patch({ discoverTotal: 1 }, "discovery.loaded"));
  component.dispose();
});
