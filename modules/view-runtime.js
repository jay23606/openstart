export function mountReactiveView({
  store,
  target,
  select,
  render = (value) => value,
  update,
  equals = Object.is,
}) {
  let disposed = false;
  let selected = select(store.state);
  let output;
  let cleanup = null;

  function commit(next, previous = selected, meta = { action: null }) {
    if (disposed) return false;
    if (cleanup) cleanup();
    const nextOutput = render(next, previous, meta);
    const nextCleanup = update(target, nextOutput, output, meta);
    cleanup = typeof nextCleanup === "function" ? nextCleanup : null;
    output = nextOutput;
    selected = next;
    return true;
  }

  commit(selected);
  const unsubscribe = store.select(select, (next, previous, _changes, meta) => {
    commit(next, previous, meta);
  }, { equals });

  function refresh() {
    return commit(select(store.state), selected, { action: "view.refresh" });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    if (cleanup) cleanup();
    cleanup = null;
  }

  return {
    dispose,
    refresh,
    get mounted() { return !disposed; },
  };
}

export function shallowEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.is(left[key], right[key]));
}
