const STORAGE_PREFIX = "openstart:draft:";

function controls(form) {
  return [...form.elements].filter((control) => control.name && !control.disabled
    && !["submit", "button", "reset", "file", "password"].includes(control.type));
}

function snapshot(form) {
  return controls(form).map((control) => ({
    name: control.name,
    type: control.type,
    value: control.value,
    checked: ["checkbox", "radio"].includes(control.type) ? control.checked : undefined,
  }));
}

function signature(form) {
  return JSON.stringify(snapshot(form));
}

function restore(form, values) {
  const available = controls(form);
  for (const saved of values) {
    const control = available.find((item) => item.name === saved.name
      && (item.type !== "radio" || item.value === saved.value));
    if (!control) continue;
    if (["checkbox", "radio"].includes(control.type)) control.checked = Boolean(saved.checked);
    else control.value = saved.value;
  }
}

export function createFormStateController({
  storage = globalThis.sessionStorage,
  confirmDiscard = (message) => globalThis.confirm(message),
  windowRef = globalThis.window,
} = {}) {
  const forms = new Map();
  const read = (key) => {
    try { return storage?.getItem(key) || null; } catch { return null; }
  };
  const write = (key, value) => {
    try { storage?.setItem(key, value); } catch {}
  };
  const remove = (key) => {
    try { storage?.removeItem(key); } catch {}
  };

  function keyFor(form) {
    return form.dataset.draftKey ? `${STORAGE_PREFIX}${form.dataset.draftKey}` : null;
  }

  function setStatus(form, dirty) {
    form.dataset.dirty = String(dirty);
    const status = form.querySelector("[data-form-state]");
    if (!status) return;
    status.textContent = dirty ? "Unsaved changes" : "All changes saved";
    status.dataset.state = dirty ? "dirty" : "saved";
  }

  function hydrate(root) {
    for (const form of forms.keys()) {
      if (form.isConnected === false) forms.delete(form);
    }
    root.querySelectorAll?.("form[data-draft-key]").forEach((form) => {
      const key = keyFor(form);
      const baseline = signature(form);
      let saved = null;
      try {
        saved = JSON.parse(read(key) || "null");
      } catch {
        remove(key);
      }
      if (Array.isArray(saved)) restore(form, saved);
      const dirty = signature(form) !== baseline;
      forms.set(form, { key, baseline, dirty });
      setStatus(form, dirty);
    });
  }

  function capture(target) {
    const form = target.closest?.("form[data-draft-key]");
    if (!form) return false;
    if (!forms.has(form)) hydrate(form.parentElement || form);
    const entry = forms.get(form);
    if (!entry) return false;
    const values = snapshot(form);
    entry.dirty = JSON.stringify(values) !== entry.baseline;
    if (entry.dirty) write(entry.key, JSON.stringify(values));
    else remove(entry.key);
    setStatus(form, entry.dirty);
    return true;
  }

  function markSaved(form) {
    const entry = forms.get(form);
    const key = entry?.key || keyFor(form);
    if (key) remove(key);
    if (entry) {
      entry.baseline = signature(form);
      entry.dirty = false;
    }
    setStatus(form, false);
  }

  function dirtyForms(root = null) {
    return [...forms.entries()]
      .filter(([form, entry]) => entry.dirty && (!root || root.contains?.(form)))
      .map(([form]) => form);
  }

  function confirmLeave(root = null) {
    const dirty = dirtyForms(root);
    if (!dirty.length) return true;
    if (!confirmDiscard("Discard your unsaved changes?")) return false;
    dirty.forEach((form) => {
      const entry = forms.get(form);
      remove(entry.key);
      entry.dirty = false;
      setStatus(form, false);
    });
    return true;
  }

  function handleBeforeUnload(event) {
    if (!dirtyForms().length) return;
    event.preventDefault();
    event.returnValue = "";
  }

  windowRef?.addEventListener?.("beforeunload", handleBeforeUnload);

  return {
    capture,
    confirmLeave,
    hydrate,
    markSaved,
    get hasUnsavedChanges() { return dirtyForms().length > 0; },
    dispose() {
      windowRef?.removeEventListener?.("beforeunload", handleBeforeUnload);
      forms.clear();
    },
  };
}
