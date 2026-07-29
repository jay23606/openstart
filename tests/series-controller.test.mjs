import assert from "node:assert/strict";
import test from "node:test";
import { createSeriesController } from "../features/series/controller.js";

function fixture() {
  const actions = [];
  const opened = [];
  const state = {
    session: { user: { id: "organizer-1" } },
    series: [{ id: "series-1", name: "Summer Series", os_series_events: [] }],
  };
  const controller = createSeriesController({
    state,
    openDialog: (content) => opened.push(content),
    forms: {
      manager: () => "series-manager",
      settings: (series) => `series-settings:${series.id}`,
    },
    renderSeries: async (series) => actions.push({ renderSeries: series.id }),
    exportStandings: (series) => actions.push({ exportSeries: series.id }),
    createSeries: async (payload) => {
      actions.push({ createSeries: payload });
      state.series.push({ id: "series-2", os_series_events: [] });
      return { id: "series-2" };
    },
    updateSeries: async (id, payload) => actions.push({ updateSeries: id, payload }),
    addSeriesEvent: async (payload) => actions.push({ addSeriesEvent: payload }),
    removeSeriesEvent: async (id) => actions.push({ removeSeriesEvent: id }),
    loadDashboard: async () => actions.push({ loadDashboard: true }),
    slugify: (value) => value.toLowerCase().replaceAll(" ", "-"),
    dialog: { close: () => actions.push({ close: true }) },
    showNotice: (message) => actions.push({ notice: message }),
    replaceUrl: (id) => actions.push({ replaceUrl: id }),
    scrollToTop: () => actions.push({ scrollToTop: true }),
  });
  return { actions, controller, opened };
}

const target = (dataset, selector = "") => ({
  dataset,
  matches: (candidate) => candidate === selector,
});

test("series controls open management and public standings views", async () => {
  const { actions, controller, opened } = fixture();

  assert.equal(await controller.handleClick(target({}, "[data-series-manager]")), true);
  assert.equal(await controller.handleClick(target({ configureSeries: "series-1" })), true);
  assert.equal(await controller.handleClick(target({ viewSeries: "series-1" })), true);

  assert.deepEqual(opened, ["series-manager", "series-settings:series-1"]);
  assert.deepEqual(actions, [
    { close: true },
    { replaceUrl: "series-1" },
    { renderSeries: "series-1" },
    { scrollToTop: true },
  ]);
});

test("adding an event refreshes the feature-owned settings dialog", async () => {
  const { actions, controller, opened } = fixture();
  const values = new Map([
    ["event_id", "event-1"],
    ["points_multiplier", "1.5"],
  ]);

  const handled = await controller.handleSubmit(
    { id: "series-event-form", dataset: { seriesId: "series-1" } },
    { get: (name) => values.get(name) },
  );

  assert.equal(handled, true);
  assert.deepEqual(actions, [
    {
      addSeriesEvent: {
        series_id: "series-1",
        event_id: "event-1",
        points_multiplier: 1.5,
        sort_order: 0,
      },
    },
    { loadDashboard: true },
    { notice: "Event added to series." },
  ]);
  assert.deepEqual(opened, ["series-settings:series-1"]);
});

test("unrelated actions remain available to other feature controllers", async () => {
  const { controller } = fixture();
  assert.equal(await controller.handleClick(target({ register: "event-1" })), false);
  assert.equal(await controller.handleSubmit({ id: "registration-form" }, new Map()), false);
});
