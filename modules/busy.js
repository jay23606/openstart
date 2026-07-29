export function createBusyController() {
  const active = new WeakSet();

  function begin(form, submitter) {
    if (active.has(form)) return null;
    active.add(form);
    form.setAttribute("aria-busy", "true");
    const controls = [...form.querySelectorAll("button[type='submit'], input[type='submit']")];
    controls.forEach((control) => {
      control.dataset.busyDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
    });
    if (submitter) {
      submitter.dataset.busyLabel = submitter.value || submitter.textContent;
      if (submitter.tagName === "INPUT") submitter.value = "Processing...";
      else submitter.textContent = submitter.dataset.progressLabel || "Processing...";
    }

    return ({ keepBusy = false } = {}) => {
      if (keepBusy) return;
      active.delete(form);
      form.removeAttribute("aria-busy");
      controls.forEach((control) => {
        control.disabled = control.dataset.busyDisabled === "true";
        delete control.dataset.busyDisabled;
      });
      if (submitter?.dataset.busyLabel) {
        if (submitter.tagName === "INPUT") submitter.value = submitter.dataset.busyLabel;
        else submitter.textContent = submitter.dataset.busyLabel;
        delete submitter.dataset.busyLabel;
      }
    };
  }

  return { begin };
}
