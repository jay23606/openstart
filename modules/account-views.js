import { escapeHtml } from "../core.js?v=36";
import { modalShell } from "./render.js?v=62";

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

  return { auth, athleteProfile, embed };
}
