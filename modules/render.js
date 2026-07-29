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

export function summaryMetrics(items, escapeHtml, className = "metric-summary", trailing = "") {
  return `<div class="${className}">${renderList(items, ({ label, value }) =>
    `<span><b>${escapeHtml(value)}</b>${escapeHtml(label)}</span>`)}${trailing}</div>`;
}

export function statusBadge(label, escapeHtml, tone = "") {
  return `<b class="status-badge${tone ? ` ${escapeHtml(tone)}` : ""}">${escapeHtml(label)}</b>`;
}

export function actionToolbar(actions, className = "dialog-actions") {
  return `<div class="${className}">${renderList(actions, ({ label, attributes = "", primary = false }) =>
    `<button class="${primary ? "primary-button" : "subtle-button"}" ${attributes} type="button">${label}</button>`)}</div>`;
}
