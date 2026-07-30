import { mountReactiveView, shallowEqual } from "./view-runtime.js";

export function mountDiscoveryResultsComponent({
  store,
  publicViews,
  documentRef = document,
}) {
  return mountReactiveView({
    store,
    target: documentRef,
    select: (state) => ({
      events: state.events,
      discoverQuery: state.discoverQuery,
      discoverRegion: state.discoverRegion,
      discoverVisible: state.discoverVisible,
      discoverTotal: state.discoverTotal,
      series: state.series,
    }),
    equals: shallowEqual,
    render: (selected) => {
      const events = selected.events.filter((event) => event.status === "published");
      const model = publicViews.discoveryModel(selected, events);
      return {
        countLabel: model.countLabel,
        markup: publicViews.discoveryResults(model),
      };
    },
    update: (root, output) => {
      const results = root.querySelector("#discover-results");
      if (!results) return;
      results.innerHTML = output.markup;
      const count = root.querySelector("#discover-count");
      if (count) count.textContent = output.countLabel;
    },
  });
}
