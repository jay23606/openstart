export function renderMarkup(target, markup) {
  if (!target) throw new Error("A render target is required");
  target.innerHTML = markup;
  return target;
}

export function renderList(items, view) {
  return items.map(view).join("");
}

export function emptyState(message, escapeHtml) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

export function modalShell({ eyebrow, title, body, wide = false }, escapeHtml) {
  return `<section class="modal${wide ? " wide-modal" : ""}">
    <div class="form-heading"><div><p>${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2></div><button data-close-dialog aria-label="Close" type="button">\u00d7</button></div>
    ${body}
  </section>`;
}
