export function createStore(initialState = {}, {
  historyLimit = 50,
  now = () => Date.now(),
  strict = true,
} = {}) {
  const listeners = new Set();
  const history = [];
  let batchDepth = 0;
  let currentAction = null;
  const pending = new Map();

  function publish(changes) {
    if (!changes.length) return;
    const actions = [...new Set(changes.map((change) => change.action).filter(Boolean))];
    const action = actions.length === 1 ? actions[0] : actions.length ? "batch" : null;
    const publicChanges = changes.map(({ key, previous, value }) => ({ key, previous, value }));
    history.push({ at: now(), action, keys: publicChanges.map((change) => change.key) });
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit);
    const changedKeys = new Set(publicChanges.map((change) => change.key));
    for (const subscription of [...listeners]) {
      if (!subscription.keys || subscription.keys.some((key) => changedKeys.has(key))) {
        subscription.listener(state, publicChanges, { action });
      }
    }
  }

  function record(key, previous, value) {
    if (Object.is(previous, value)) return;
    if (batchDepth) {
      const existing = pending.get(key);
      pending.set(key, { key, previous: existing?.previous ?? previous, value, action: currentAction || existing?.action });
      return;
    }
    publish([{ key, previous, value, action: currentAction }]);
  }

  const state = new Proxy({ ...initialState }, {
    set(target, key, value) {
      if (strict && !Reflect.has(target, key)) {
        throw new Error(`Unknown state key: ${String(key)}`);
      }
      const previous = target[key];
      target[key] = value;
      record(key, previous, value);
      return true;
    },
    deleteProperty(_target, key) {
      throw new Error(`State keys cannot be deleted: ${String(key)}`);
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

  function applyPatch(values) {
    batch(() => {
      Object.entries(values).forEach(([key, value]) => {
        state[key] = value;
      });
    });
  }

  function patch(values, actionName = null) {
    return actionName ? action(actionName, () => applyPatch(values)) : applyPatch(values);
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

  function action(name, operation) {
    const previousAction = currentAction;
    currentAction = name;
    try {
      return batch(operation);
    } finally {
      currentAction = previousAction;
    }
  }

  const getHistory = () => history.map((entry) => ({ ...entry, keys: [...entry.keys] }));
  const clearHistory = () => { history.length = 0; };

  function select(selector, listener, options = {}) {
    let selected = selector(state);
    if (options.immediate) listener(selected, undefined, [], { action: null });
    return subscribe(null, (currentState, changes, meta) => {
      const next = selector(currentState);
      if ((options.equals || Object.is)(selected, next)) return;
      const previous = selected;
      selected = next;
      listener(next, previous, changes, meta);
    });
  }

  return { state, subscribe, select, patch, batch, action, getHistory, clearHistory };
}
