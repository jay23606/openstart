import assert from "node:assert/strict";
import test from "node:test";
import { mountOrganizerDashboardComponent } from "../modules/organizer-dashboard-component.js";
import { createStore } from "../modules/store.js";

function fixture({ focusedSelector = null, visible = true } = {}) {
  const store = createStore({
    events: [{ id: "event-1" }],
    organizerMetrics: [],
    profile: null,
    campaigns: [],
    series: [],
    auditLog: [],
  });
  const replacements = [];
  const regions = new Map([
    [".dashboard-header", { selector: ".dashboard-header" }],
    [".metric-grid", { selector: ".metric-grid" }],
    ['[data-dashboard-region="events"]', { selector: '[data-dashboard-region="events"]' }],
    ['[data-dashboard-region="financials"]', { selector: '[data-dashboard-region="financials"]' }],
    ['[data-dashboard-region="communications"]', { selector: '[data-dashboard-region="communications"]' }],
    ['[data-dashboard-region="series"]', { selector: '[data-dashboard-region="series"]' }],
    ['[data-dashboard-region="audit"]', { selector: '[data-dashboard-region="audit"]' }],
  ]);
  for (const region of regions.values()) {
    region.contains = (element) => element?.selector === region.selector;
    region.replaceWith = (replacement) => replacements.push([region.selector, replacement.markup]);
  }
  const activeElement = focusedSelector ? { selector: focusedSelector } : null;
  const documentRef = {
    activeElement,
    querySelector: (selector) => visible ? regions.get(selector) || null : null,
    createElement: () => {
      const template = { content: {} };
      Object.defineProperty(template, "innerHTML", {
        set(markup) {
          template.content.querySelector = (selector) => ({ selector, markup });
        },
      });
      return template;
    },
  };
  const organizerViews = {
    dashboard: (state) => `events:${state.events.map((event) => event.id).join(",")}`,
  };
  const component = mountOrganizerDashboardComponent({
    store,
    organizerViews,
    configured: true,
    eventById: () => null,
    documentRef,
  });
  replacements.length = 0;
  return { component, replacements, store };
}

test("organizer dashboard component updates stable dashboard regions", () => {
  const { component, replacements, store } = fixture();
  store.patch({ events: [{ id: "event-2" }] }, "dashboard.loaded");
  assert.deepEqual(replacements, [
    [".dashboard-header", "events:event-2"],
    [".metric-grid", "events:event-2"],
    ['[data-dashboard-region="events"]', "events:event-2"],
    ['[data-dashboard-region="financials"]', "events:event-2"],
    ['[data-dashboard-region="communications"]', "events:event-2"],
    ['[data-dashboard-region="series"]', "events:event-2"],
    ['[data-dashboard-region="audit"]', "events:event-2"],
  ]);
  component.dispose();
});

test("organizer dashboard component preserves a focused region", () => {
  const { component, replacements, store } = fixture({ focusedSelector: ".dashboard-header" });
  store.patch({ profile: { stripe_account_id: "acct_test" } }, "profile.loaded");
  assert.deepEqual(replacements.map(([selector]) => selector), [
    ".metric-grid",
    '[data-dashboard-region="events"]',
    '[data-dashboard-region="financials"]',
    '[data-dashboard-region="communications"]',
    '[data-dashboard-region="series"]',
    '[data-dashboard-region="audit"]',
  ]);
  component.dispose();
});

test("organizer dashboard component tolerates routes without dashboard regions", () => {
  const { component, store } = fixture({ visible: false });
  assert.doesNotThrow(() => store.patch({ organizerMetrics: [{ event_id: "event-1" }] }, "dashboard.loaded"));
  component.dispose();
});
