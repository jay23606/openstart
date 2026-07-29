import { displayDate, escapeHtml } from "../core.js?v=36";
import { modalShell } from "./render.js?v=62";
import { contentHtml, ordinal, resultTime } from "./ui.js?v=40";

function athletePrs(results) {
  const best = new Map();
  for (const row of results) {
    if (row.status !== "finisher") continue;
    const milliseconds = row.chip_time_ms ?? row.gun_time_ms;
    if (milliseconds == null) continue;
    const key = row.distance_label || row.tier_name || "Result";
    const current = best.get(key);
    if (!current || milliseconds < current.milliseconds) best.set(key, { milliseconds, event: row.event_name, when: row.starts_at });
  }
  return [...best.entries()].map(([label, info]) => ({ label, ...info }));
}

export function createAccountViews({ getBaseUri }) {
  function auth() {
    const body = `<form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" autofocus required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button class="primary-button" name="intent" value="signin" type="submit">Sign in</button><button class="subtle-button" name="intent" value="signup" type="submit">Create account</button><p class="form-message" aria-live="polite"></p></form>`;
    return modalShell({ eyebrow: "OpenStart account", title: "Sign in to OpenStart", body, className: "auth-modal" }, escapeHtml);
  }

  function athleteProfile(profile) {
    const current = profile || {};
    const body = `<form id="athlete-profile-form">
      <label>Public handle<input name="handle" value="${escapeHtml(current.handle || "")}" pattern="[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])" minlength="3" maxlength="32" placeholder="jane-runner" required ${profile ? "readonly" : ""}></label>
      <p class="form-hint">Lowercase letters, numbers, and hyphens. Your page lives at <code>?athlete=your-handle</code>.${profile ? " Handles can't be changed once set." : ""}</p>
      <label>Display name<input name="display_name" value="${escapeHtml(current.display_name || "")}" maxlength="80" placeholder="Jane Runner"></label>
      <label>Location<input name="location" value="${escapeHtml(current.location || "")}" maxlength="80" placeholder="Boulder, CO"></label>
      <label>Short bio<textarea name="bio" maxlength="400" placeholder="Trail runner chasing a half-marathon PR.">${escapeHtml(current.bio || "")}</textarea></label>
      <label class="checkbox-row"><input type="checkbox" name="is_public" ${current.is_public === false ? "" : "checked"}> Make my profile and results public</label>
      <p class="form-message"></p><button class="primary-button" type="submit">${profile ? "Save profile" : "Create profile"}</button>
    </form>`;
    return modalShell({ eyebrow: "Runner profile", title: `${profile ? "Edit" : "Create"} your athlete page`, body }, escapeHtml);
  }

  function embed(event) {
    const scriptSrc = new URL("embed.js", getBaseUri()).href;
    const snippet = `<div data-openstart-embed="${event.slug}"></div>\n<script src="${scriptSrc}"></script>`;
    const preview = new URL("embed.html", getBaseUri());
    preview.searchParams.set("event", event.slug);
    const body = `<p class="form-hint">Paste this where you want a registration widget to appear on your own website. Checkout runs securely on OpenStart — no extra configuration required.</p>
      <label>Embed code<textarea id="embed-snippet" rows="3" readonly>${escapeHtml(snippet)}</textarea></label>
      <div class="card-actions"><button class="primary-button" data-copy-embed type="button">Copy code</button><a class="subtle-button" href="${escapeHtml(preview.href)}" target="_blank" rel="noopener">Preview widget</a></div>
      <p class="form-hint">Optional: add <code>data-openstart-accent="#0f6b4f"</code> to the div to match your brand colour.</p>`;
    return modalShell({ eyebrow: "Embed registration", title: event.name, body }, escapeHtml);
  }

  function publicAthlete({ profile, results }) {
    const finishes = results.filter((row) => row.status === "finisher");
    const prs = athletePrs(results);
    const name = profile.display_name || `@${profile.handle}`;
    return `
      <section class="athlete-page">
        <div class="athlete-header">
          <button class="text-button" data-back type="button">← OpenStart</button>
          <div class="athlete-identity">
            <span class="athlete-avatar" aria-hidden="true">${escapeHtml((profile.display_name || profile.handle).slice(0, 1).toUpperCase())}</span>
            <div>
              <p class="eyebrow">Athlete</p>
              <h1>${escapeHtml(name)}</h1>
              <p class="athlete-meta">@${escapeHtml(profile.handle)}${profile.location ? ` · ${escapeHtml(profile.location)}` : ""}</p>
            </div>
          </div>
          ${profile.bio ? `<p class="athlete-bio">${contentHtml(profile.bio)}</p>` : ""}
        </div>
        <div class="metric-grid">
          <div><p>Races</p><strong>${results.length}</strong><span>Published results</span></div>
          <div><p>Finishes</p><strong>${finishes.length}</strong><span>Official finisher results</span></div>
          <div><p>Distances</p><strong>${prs.length}</strong><span>Personal bests below</span></div>
        </div>
        ${prs.length ? `<div class="dashboard-card"><div class="card-heading"><div><h2>Personal bests</h2><p>Fastest published finish per distance.</p></div></div>
          <div class="athlete-pr-grid">${prs.map((pr) => `<article><b>${resultTime(pr.milliseconds)}</b><span>${escapeHtml(pr.label)}</span><small>${escapeHtml(pr.event)} · ${displayDate(pr.when)}</small></article>`).join("")}</div></div>` : ""}
        <div class="dashboard-card">
          <div class="card-heading"><div><h2>Race history</h2><p>Every published result, newest first.</p></div></div>
          <div class="athlete-results">
            ${results.length ? results.map((row) => {
              const milliseconds = row.chip_time_ms ?? row.gun_time_ms;
              const place = row.status === "finisher" && row.overall_place ? `${row.overall_place} / ${row.tier_finishers}` : "—";
              const division = row.status === "finisher" && row.division_place && row.division ? `${ordinal(row.division_place)} ${escapeHtml(row.division)}` : "";
              return `<article class="athlete-result">
                <div class="athlete-result-main">
                  <p>${displayDate(row.starts_at)} · ${escapeHtml(row.location_name || "")}</p>
                  <h3>${escapeHtml(row.event_name)}</h3>
                  <small>${escapeHtml(row.tier_name)}${row.distance_label ? ` · ${escapeHtml(row.distance_label)}` : ""}</small>
                </div>
                <div class="athlete-result-time">
                  <b>${row.status === "finisher" ? resultTime(milliseconds) : row.status.toUpperCase()}</b>
                  <span>${place}${division ? ` · ${division}` : ""}</span>
                </div>
              </article>`;
            }).join("") : '<div class="empty-state">No published results yet.</div>'}
          </div>
        </div>
      </section>`;
  }

  return { auth, athleteProfile, embed, publicAthlete };
}
