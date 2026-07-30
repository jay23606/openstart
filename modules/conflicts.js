import { modalShell } from "./render.js?v=62";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

export class StaleWriteError extends Error {
  constructor(latest) {
    super("This event was changed after you opened it.");
    this.name = "StaleWriteError";
    this.code = "OS_STALE_WRITE";
    this.latest = latest;
  }
}

export function overlappingChanges(base, draft, latest) {
  return Object.keys(draft).filter((field) => {
    const original = base?.[field] ?? null;
    const local = draft[field] ?? null;
    const remote = latest?.[field] ?? null;
    return !Object.is(local, original) && !Object.is(remote, original) && !Object.is(local, remote);
  });
}

function display(value) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function conflictView({ eventName, fields, draft, latest }) {
  const rows = fields.map((field) => `
    <article class="conflict-row">
      <h3>${escapeHtml(field.replaceAll("_", " "))}</h3>
      <div><span><b>Your draft</b>${escapeHtml(display(draft[field]))}</span><span><b>Latest saved</b>${escapeHtml(display(latest[field]))}</span></div>
    </article>`).join("");
  const body = `<p class="modal-note">Someone else changed ${escapeHtml(eventName || "this event")} while you were editing. Review the overlapping fields before choosing which version to keep.</p>
    <div class="conflict-list">${rows}</div>
    <div class="dialog-actions">
      <button class="subtle-button" data-conflict-action="keep" type="button">Keep editing</button>
      <button class="subtle-button" data-conflict-action="reload" type="button">Use latest saved</button>
      <button class="danger-button" data-conflict-action="overwrite" type="button">Overwrite with my draft</button>
    </div>`;
  return modalShell({ eyebrow: "Edit conflict", title: "This event changed elsewhere", body }, escapeHtml);
}

export function createConflictController({
  updateEventSettings,
  openDialog,
  closeDialog,
  showNotice,
}) {
  let pending = null;

  async function updateEvent({
    eventId,
    expectedUpdatedAt,
    base,
    changes,
    eventName,
    onSaved = async () => {},
    onReload = async () => {},
    onKeep = async () => {},
  }) {
    try {
      const saved = await updateEventSettings(eventId, changes, { expectedUpdatedAt });
      await onSaved(saved);
      return { status: "saved", event: saved };
    } catch (error) {
      if (error?.code !== "OS_STALE_WRITE") throw error;
      const fields = overlappingChanges(base, changes, error.latest);
      if (!fields.length) {
        const saved = await updateEventSettings(eventId, changes, {
          expectedUpdatedAt: error.latest.updated_at,
        });
        await onSaved(saved);
        showNotice("Your changes were merged with a newer event update.");
        return { status: "merged", event: saved };
      }
      pending = {
        eventId, changes, latest: error.latest, fields, eventName,
        onSaved, onReload, onKeep,
      };
      openDialog(conflictView({ eventName, fields, draft: changes, latest: error.latest }));
      return { status: "conflict", fields };
    }
  }

  async function handleClick(target) {
    const action = target.dataset.conflictAction;
    if (!action || !pending) return false;
    const conflict = pending;
    if (action === "keep") {
      pending = null;
      closeDialog();
      await conflict.onKeep(conflict.latest);
      return true;
    }
    if (action === "reload") {
      pending = null;
      closeDialog();
      await conflict.onReload(conflict.latest);
      showNotice("Latest saved event loaded. Your local draft was discarded.");
      return true;
    }
    if (action === "overwrite") {
      target.disabled = true;
      try {
        const saved = await updateEventSettings(conflict.eventId, conflict.changes, {
          expectedUpdatedAt: conflict.latest.updated_at,
        });
        pending = null;
        closeDialog();
        await conflict.onSaved(saved);
        showNotice("Your draft replaced the conflicting event changes.");
      } catch (error) {
        target.disabled = false;
        if (error?.code === "OS_STALE_WRITE") {
          conflict.latest = error.latest;
          conflict.fields = Object.keys(conflict.changes);
          pending = conflict;
          openDialog(conflictView({
            eventName: conflict.eventName,
            fields: Object.keys(conflict.changes),
            draft: conflict.changes,
            latest: error.latest,
          }));
          showNotice("The event changed again. Review the newest saved values.", {
            type: "error",
            duration: 0,
          });
          return true;
        }
        throw error;
      }
      return true;
    }
    return false;
  }

  return { handleClick, updateEvent };
}
