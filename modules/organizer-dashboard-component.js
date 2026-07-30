import { mountReactiveView, shallowEqual } from "./view-runtime.js";

const DASHBOARD_REGIONS = [
  ".dashboard-header",
  ".metric-grid",
  '[data-dashboard-region="events"]',
  '[data-dashboard-region="financials"]',
  '[data-dashboard-region="communications"]',
  '[data-dashboard-region="series"]',
  '[data-dashboard-region="audit"]',
];

export function mountOrganizerDashboardComponent({
  store,
  organizerViews,
  configured,
  eventById,
  documentRef = document,
}) {
  return mountReactiveView({
    store,
    target: documentRef,
    select: (state) => ({
      events: state.events,
      organizerMetrics: state.organizerMetrics,
      profile: state.profile,
      campaigns: state.campaigns,
      series: state.series,
      auditLog: state.auditLog,
    }),
    equals: shallowEqual,
    render: (selected) => organizerViews.dashboard(selected, configured, eventById),
    update: (root, markup) => {
      const template = root.createElement("template");
      template.innerHTML = markup;
      for (const selector of DASHBOARD_REGIONS) {
        const current = root.querySelector(selector);
        const replacement = template.content.querySelector(selector);
        if (!current || !replacement) continue;
        if (root.activeElement && current.contains?.(root.activeElement)) continue;
        current.replaceWith(replacement);
      }
    },
  });
}
