export function createStore(initialState = {}) {
  const listeners = new Set();
  let batchDepth = 0;
  const pending = new Map();

  function publish(changes) {
    if (!changes.length) return;
    const changedKeys = new Set(changes.map((change) => change.key));
    for (const subscription of [...listeners]) {
      if (!subscription.keys || subscription.keys.some((key) => changedKeys.has(key))) {
        subscription.listener(state, changes);
      }
    }
  }

  function record(key, previous, value) {
    if (Object.is(previous, value)) return;
    if (batchDepth) {
      const existing = pending.get(key);
      pending.set(key, { key, previous: existing?.previous ?? previous, value });
      return;
    }
    publish([{ key, previous, value }]);
  }

  const state = new Proxy({ ...initialState }, {
    set(target, key, value) {
      const previous = target[key];
      target[key] = value;
      record(key, previous, value);
      return true;
    },
  });

  function subscribe(keys, listener, { immediate = false } = {}) {
    const subscription = {
      keys: keys == null ? null : Array.isArray(keys) ? keys : [keys],
      listener,
    };
    listeners.add(subscription);
    if (immediate) listener(state, []);
    return () => listeners.delete(subscription);
  }

  function patch(values) {
    batch(() => {
      Object.entries(values).forEach(([key, value]) => {
        state[key] = value;
      });
    });
  }

  function batch(action) {
    batchDepth += 1;
    try {
      return action(state);
    } finally {
      batchDepth -= 1;
      if (!batchDepth && pending.size) {
        const changes = [...pending.values()].filter((change) => !Object.is(change.previous, change.value));
        pending.clear();
        publish(changes);
      }
    }
  }

  return { state, subscribe, patch, batch };
}
