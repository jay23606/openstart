import { mountReactiveView, shallowEqual } from "./view-runtime.js";

export function mountNavigationComponent({
  store,
  documentRef = document,
  authButton,
  signOutButton,
  platformNav,
}) {
  return mountReactiveView({
    store,
    target: documentRef,
    select: (state) => ({
      view: state.view,
      signedIn: Boolean(state.session),
      platformAllowed: Boolean(state.platformAdmin?.allowed),
    }),
    equals: shallowEqual,
    update: (root, model) => {
      root.querySelectorAll("[data-view]").forEach((button) => {
        button.classList.toggle("nav-active", button.dataset.view === model.view);
      });
      authButton.classList.toggle("hidden", model.signedIn);
      signOutButton.classList.toggle("hidden", !model.signedIn);
      platformNav.classList.toggle("hidden", !model.platformAllowed);
    },
  });
}
