import { mountReactiveView, shallowEqual } from "./view-runtime.js";

export function mountRunnerDashboardComponent({
  store,
  accountViews,
  documentRef = document,
}) {
  return mountReactiveView({
    store,
    target: documentRef,
    select: (state) => ({
      runnerRegistrations: state.runnerRegistrations,
      captainTeams: state.captainTeams,
      volunteerSignups: state.volunteerSignups,
      lotteryApplications: state.lotteryApplications,
      athleteProfile: state.athleteProfile,
      session: state.session,
    }),
    equals: shallowEqual,
    render: (selected) => accountViews.runnerDashboard(selected),
    update: (root, markup) => {
      const current = root.querySelector("[data-runner-dashboard]");
      if (!current) return;
      if (root.activeElement && current.contains?.(root.activeElement)) return;
      const template = root.createElement("template");
      template.innerHTML = markup;
      const replacement = template.content.querySelector("[data-runner-dashboard]");
      if (replacement) current.replaceWith(replacement);
    },
  });
}
