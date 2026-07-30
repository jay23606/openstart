import assert from "node:assert/strict";
import test from "node:test";
import { mountNavigationComponent } from "../modules/navigation-component.js";
import { createStore } from "../modules/store.js";

function element(dataset = {}) {
  return {
    dataset,
    hidden: false,
    classList: {
      values: new Set(),
      toggle(name, force) {
        if (force) this.values.add(name);
        else this.values.delete(name);
      },
      contains(name) { return this.values.has(name); },
    },
  };
}

test("navigation component reacts to route, session, and access state", () => {
  const store = createStore({
    view: "discover",
    session: null,
    platformAdmin: null,
  });
  const discover = element({ view: "discover" });
  const runner = element({ view: "runner" });
  const auth = element();
  const signOut = element();
  const platform = element({ view: "platform" });
  const component = mountNavigationComponent({
    store,
    documentRef: { querySelectorAll: () => [discover, runner, platform] },
    authButton: auth,
    signOutButton: signOut,
    platformNav: platform,
  });

  assert.equal(discover.classList.contains("nav-active"), true);
  assert.equal(signOut.classList.contains("hidden"), true);

  store.patch({
    view: "runner",
    session: { user: { id: "runner" } },
    platformAdmin: { allowed: true },
  }, "session.ready");

  assert.equal(discover.classList.contains("nav-active"), false);
  assert.equal(runner.classList.contains("nav-active"), true);
  assert.equal(auth.classList.contains("hidden"), true);
  assert.equal(signOut.classList.contains("hidden"), false);
  assert.equal(platform.classList.contains("hidden"), false);
  component.dispose();
});
