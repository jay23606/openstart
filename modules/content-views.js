import { escapeHtml } from "../core.js?v=36";
import { helpArticles, showcaseFeatures } from "./content-data.js?v=40";

export function helpView() {
  const audiences=["All",...new Set(helpArticles.map((article)=>article.audience))];
  return `
    <section class="help-page">
      <div class="help-hero">
        <p class="eyebrow">OPENSTART HELP</p>
        <h1>How can we help?</h1>
        <p>Quick, plain-language guides for runners, organizers, volunteers, and race-day staff.</p>
        <label class="help-search">
          <span>Search help</span>
          <input data-help-search type="search" placeholder="Try “Stripe”, “transfer”, or “results”" autocomplete="off">
        </label>
      </div>
      <div class="help-content">
        <div class="help-filters" aria-label="Filter help topics">
          ${audiences.map((audience,index)=>`<button class="${index===0 ? "active" : ""}" data-help-filter="${escapeHtml(audience)}" type="button">${escapeHtml(audience)}</button>`).join("")}
        </div>
        <p class="help-count" aria-live="polite">${helpArticles.length} guides</p>
        <div class="help-grid">
          ${helpArticles.map((article)=>`
            <details data-help-article data-help-audience="${escapeHtml(article.audience)}" data-help-searchable="${escapeHtml(`${article.audience} ${article.title} ${article.keywords} ${article.body}`.toLowerCase())}">
              <summary><span>${escapeHtml(article.audience)}</span>${escapeHtml(article.title)}</summary>
              <p>${escapeHtml(article.body)}</p>
            </details>`).join("")}
        </div>
        <aside class="architecture-promo">
          <div><p class="eyebrow">FOR BUILDERS &amp; OPERATORS</p><h2>See how OpenStart fits together.</h2><p>A concise architecture paper covering the application, data model, trust boundaries, payments, communications, and race-day operations.</p></div>
          <button class="primary-button" data-view="architecture" type="button">Read the architecture paper</button>
        </aside>
        <aside class="help-support">
          <div><p class="eyebrow">STILL STUCK?</p><h2>Tell us what happened.</h2></div>
          <p>Include the page you were on and the exact error message. Never include passwords, Stripe secret keys, or other credentials.</p>
          <a class="primary-button" href="https://github.com/jay23606/openstart/issues/new" target="_blank" rel="noreferrer">Open a GitHub issue</a>
        </aside>
      </div>
    </section>`;
}

export function demoView(state) {
  const showcase=state.events.find((event)=>event.is_showcase);
  return `
    <section class="demo-page">
      <div class="demo-hero">
        <div><p class="eyebrow">OPENSTART DEMO</p><h1>See the whole platform without building a race first.</h1><p>Explore what each tool does, then create one private showcase event to open the working organizer screens with sample data.</p></div>
        <aside><b>Safe by design</b><span>Private draft</span><span>No real payments</span><span>No participant emails</span><span>Excluded from reports</span></aside>
      </div>
      <div class="demo-setup">
        ${!state.session ? `<div><h2>Want to try the working tools?</h2><p>Sign in or create an account, then OpenStart will build a disposable private showcase for you.</p></div><button class="primary-button" data-demo-sign-in type="button">Sign in to create showcase</button>` :
          showcase ? `<div><p class="eyebrow">YOUR PRIVATE SHOWCASE</p><h2>${escapeHtml(showcase.name)}</h2><p>Sample data is ready. Use any “Open tool” button below, or remove the showcase when you are finished.</p></div><span><button class="subtle-button" data-demo-roster="${showcase.id}" type="button">Open full workspace</button><button class="danger-button" data-delete-showcase="${showcase.id}" type="button">Remove showcase</button></span>` :
          `<div><h2>Create your private feature showcase</h2><p>This adds one clearly labeled draft event to your account with sample runners, results, products, waves, volunteers, and website content.</p></div><button class="primary-button" data-create-showcase type="button">Create showcase</button>`}
      </div>
      <div class="demo-heading"><div><p class="eyebrow">FEATURE EXPLORER</p><h2>Everything in one place</h2></div><p>Each card explains what the feature unlocks. Working launchers appear after your showcase is created.</p></div>
      <div class="demo-grid">
        ${showcaseFeatures.map(([key,title,description],index)=>`<article><span>${String(index+1).padStart(2,"0")}</span><h3>${title}</h3><p>${description}</p>${showcase && key!=="communications" ? `<button class="text-button" data-demo-feature="${key}" data-event-id-demo="${showcase.id}" type="button">Open tool →</button>` : key==="communications" ? `<small>Guided preview only — sending is disabled in the showcase.</small>` : `<small>${state.session ? "Create the showcase to open this tool." : "Sign in to unlock the working demo."}</small>`}</article>`).join("")}
      </div>
    </section>`;
}
