const focusableSelector = [
  "button:not([disabled])", "a[href]", "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");
const formFocusSelector = [
  "[autofocus]", "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])", "textarea:not([disabled])",
].join(",");

export function createDialogController({ dialog, content, onClose = () => {} }) {
  let returnFocus = null;

  const close = () => {
    if (dialog.open) dialog.close();
  };

  const open = (html, trigger = document.activeElement) => {
    if (dialog.open) close();
    returnFocus = trigger instanceof HTMLElement ? trigger : null;
    content.innerHTML = html;
    dialog.showModal();
    requestAnimationFrame(() => {
      (dialog.querySelector(formFocusSelector) || dialog.querySelector(focusableSelector))?.focus();
    });
  };

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest?.("[data-close-dialog]")) close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(focusableSelector)];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("close", () => {
    onClose();
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus();
  });

  return { close, open };
}

export function createNoticeController({ notice, defaultDuration = 5000 }) {
  let timer = null;
  const message = notice.querySelector("span");

  const dismiss = () => {
    clearTimeout(timer);
    timer = null;
    notice.classList.add("hidden");
  };

  const show = (text, { type = "status", duration = defaultDuration } = {}) => {
    clearTimeout(timer);
    message.textContent = text;
    notice.dataset.type = type;
    notice.setAttribute("role", type === "error" ? "alert" : "status");
    notice.classList.remove("hidden");
    if (duration > 0 && type !== "error") timer = setTimeout(dismiss, duration);
  };

  notice.querySelector("button")?.addEventListener("click", dismiss);
  return { dismiss, show };
}
