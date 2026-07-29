import assert from "node:assert/strict";
import test from "node:test";
import { createPublicController } from "../features/public/controller.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(overrides = {}) {
  const state = {
    discoverQuery: "",
    discoverRegion: null,
    discoverVisible: 12,
    discoverTotal: 0,
    discoverRequest: 0,
    events: [],
    series: [],
    selectedEvent: null,
  };
  const page = { innerHTML: "" };
  const results = { innerHTML: "" };
  const count = { textContent: "" };
  const notices = [];
  const metadata = [];
  const patches = [];
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const publicViews = {
    discoveryModel: (currentState, events) => ({
      events,
      countLabel: `${currentState.discoverTotal} events`,
    }),
    discoveryPage: (model) => `page:${model.events.map((event) => event.id).join(",")}`,
    discoveryResults: (model) => `results:${model.events.map((event) => event.id).join(",")}`,
    eventModel: (event, preview) => ({ event, preview }),
    eventPage: (model) => `event:${model.event.id}:${model.preview}`,
  };
  const controller = createPublicController({
    state,
    publicViews,
    listPublishedEvents: async () => [],
    renderPage: (markup, options = {}) => {
      page.innerHTML = markup;
      if (options.metadata) metadata.push(options.metadata);
    },
    hydrateEvent: async (id) => ({ id, name: "Race", description: "Description" }),
    parseRegion: (value) => value === "Boulder, CO" ? { city: "boulder", state: "CO" } : { city: value, state: "" },
    stateFromCoords: () => "CO",
    showNotice: (message) => notices.push(message),
    documentRef: {
      querySelector: (selector) => selector === "#discover-results" ? results : selector === "#discover-count" ? count : null,
    },
    storage,
    geolocation: null,
    schedule: () => 1,
    cancelSchedule: () => {},
    scrollToTop: () => {},
    patchState: (values) => {
      patches.push(Object.keys(values));
      Object.assign(state, values);
    },
    ...overrides,
  });
  return { controller, state, page, results, count, notices, metadata, patches, storage, storageValues, publicViews };
}

test("public controller ignores stale discovery responses", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const { controller, state } = fixture({
    listPublishedEvents: () => (++calls === 1 ? first.promise : second.promise),
  });

  const stale = controller.loadDiscovery();
  const current = controller.loadDiscovery();
  second.resolve({ events: [{ id: "new", status: "published" }], total: 1 });
  assert.equal(await current, true);
  first.resolve({ events: [{ id: "old", status: "published" }], total: 9 });
  assert.equal(await stale, false);

  assert.deepEqual(state.events.map((event) => event.id), ["new"]);
  assert.equal(state.discoverTotal, 1);
});

test("public controller patches discovery results and filters atomically", async () => {
  const scheduled = [];
  const { controller, patches } = fixture({
    listPublishedEvents: async () => ({ events: [{ id: "race", status: "published" }], total: 1 }),
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
  });

  controller.search("trail");
  assert.deepEqual(patches[0], ["discoverQuery", "discoverVisible"]);
  await scheduled[0]();
  assert.deepEqual(patches.slice(1), [
    ["discoverRequest"],
    ["events", "discoverTotal"],
  ]);
});

test("public controller debounces search and refreshes only the result region", async () => {
  const scheduled = [];
  const cancelled = [];
  const { controller, state, page, results, count } = fixture({
    listPublishedEvents: async ({ query }) => ({ events: [{ id: query, status: "published" }], total: 1 }),
    schedule: (callback) => {
      const task = { callback, id: scheduled.length + 1 };
      scheduled.push(task);
      return task.id;
    },
    cancelSchedule: (id) => cancelled.push(id),
  });
  page.innerHTML = "unchanged";

  controller.search("first");
  controller.search("second");
  assert.deepEqual(cancelled, [1]);
  await scheduled[1].callback();

  assert.equal(state.discoverQuery, "second");
  assert.equal(state.discoverVisible, 12);
  assert.equal(page.innerHTML, "unchanged");
  assert.equal(results.innerHTML, "results:second");
  assert.equal(count.textContent, "1 events");
});

test("public controller persists valid regions and restores them safely", async () => {
  const { controller, state, page, storageValues } = fixture({
    listPublishedEvents: async () => ({ events: [{ id: "co", status: "published" }], total: 1 }),
  });

  assert.equal(await controller.resolvePlace("Boulder, CO"), true);
  assert.deepEqual(state.discoverRegion, { city: "boulder", state: "CO" });
  assert.equal(storageValues.get("openstart-region"), '{"city":"boulder","state":"CO"}');
  assert.equal(page.innerHTML, "page:co");

  state.discoverRegion = null;
  assert.deepEqual(controller.restoreRegion(), { city: "boulder", state: "CO" });
});

test("public controller handles unavailable location and opens hydrated events", async () => {
  let scrolled = false;
  const { controller, state, notices, page } = fixture({
    geolocation: null,
    hydrateEvent: async (id) => ({ id, name: "Hydrated race", description: "Full details" }),
    scrollToTop: () => { scrolled = true; },
  });

  assert.equal(await controller.useLocation({}), false);
  assert.match(notices[0], /cannot share a location/);
  assert.equal(await controller.openEvent("event-1"), true);
  assert.equal(state.selectedEvent.name, "Hydrated race");
  assert.equal(page.innerHTML, "event:event-1:false");
  assert.equal(scrolled, true);
});

test("public controller claims only its own delegated DOM actions", async () => {
  const scheduled = [];
  const { controller, state, page } = fixture({
    hydrateEvent: async (id) => ({ id, name: "Race", description: "Details" }),
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
  });
  const eventButton = {
    dataset: { eventId: "event-9" },
    matches: () => false,
  };
  const unrelated = { dataset: {}, matches: () => false };
  const search = { id: "discover-search", value: "trail" };
  let prevented = false;

  assert.equal(await controller.handleClick(unrelated), false);
  assert.equal(await controller.handleClick(eventButton), true);
  assert.equal(page.innerHTML, "event:event-9:false");
  assert.equal(controller.handleInput({ id: "other" }), false);
  assert.equal(controller.handleInput(search), true);
  assert.equal(state.discoverQuery, "trail");
  assert.equal(controller.handleKeydown(
    { id: "discover-place", value: "Boulder, CO" },
    { key: "Enter", preventDefault: () => { prevented = true; } },
  ), true);
  assert.equal(prevented, true);
  assert.equal(controller.handleKeydown(
    { id: "discover-place", value: "Boulder, CO" },
    { key: "Escape", preventDefault: () => {} },
  ), false);
});
