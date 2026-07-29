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

export function architectureView() {
  return `
    <article class="architecture-page">
      <header class="architecture-hero">
        <button class="back-button" data-view="help" type="button">← Back to Help</button>
        <p class="eyebrow">OPENSTART ARCHITECTURE · JULY 2026</p>
        <h1>A simple platform for a complicated race day.</h1>
        <p>OpenStart keeps the browser lightweight and puts durable records, permissions, capacity, and money decisions behind server-controlled boundaries. This paper is a practical map of the system, not an exhaustive specification.</p>
        <div class="architecture-facts">
          <span><b>Static web app</b>Fast, portable client</span>
          <span><b>Postgres core</b>One source of truth</span>
          <span><b>Edge functions</b>Trusted integrations</span>
          <span><b>Open source</b>Auditable by design</span>
        </div>
      </header>
      <nav class="architecture-toc" aria-label="Architecture paper sections">
        <a href="#system-map">System map</a><a href="#domains">Core domains</a><a href="#flows">Critical flows</a><a href="#trust">Trust &amp; reliability</a><a href="#deployment">Deployment</a>
      </nav>
      <div class="architecture-body">
        <section class="paper-section paper-intro">
          <div><p class="section-number">01</p><h2>Design in one sentence</h2></div>
          <p>OpenStart is a browser-delivered race-management application backed by Supabase: the client handles presentation and workflow, Postgres owns durable state and invariants, and Edge Functions mediate operations that require secrets or external providers.</p>
        </section>
        <section class="paper-section" id="system-map">
          <div><p class="section-number">02</p><h2>System map</h2><p class="section-lede">Four user groups share one application surface, while policy and provider boundaries stay on the server.</p></div>
          <figure class="system-diagram" aria-labelledby="system-map-caption">
            <div class="diagram-users"><span>Runners</span><span>Organizers</span><span>Race-day staff</span><span>Platform operators</span></div>
            <div class="diagram-connector" aria-hidden="true"><i></i><b>HTTPS</b><i></i></div>
            <div class="diagram-client"><small>CLIENT</small><strong>OpenStart web application</strong><span>Discovery · Registration · Organizer workspace · Race-day tools</span></div>
            <div class="diagram-connector" aria-hidden="true"><i></i><b>Supabase SDK / API</b><i></i></div>
            <div class="diagram-platform">
              <div><small>IDENTITY</small><strong>Supabase Auth</strong><span>Sessions and verified accounts</span></div>
              <div class="diagram-core"><small>SYSTEM OF RECORD</small><strong>Postgres + RLS</strong><span>Events, people, orders, results, audit history</span></div>
              <div><small>TRUSTED COMPUTE</small><strong>Edge Functions</strong><span>Payments, email, admin, race operations</span></div>
            </div>
            <div class="diagram-connector" aria-hidden="true"><i></i><b>Verified provider APIs</b><i></i></div>
            <div class="diagram-providers"><span><b>Stripe</b>Checkout &amp; payouts</span><span><b>Resend</b>Transactional &amp; campaign email</span></div>
            <figcaption id="system-map-caption">The client never receives provider secrets. Row Level Security and server functions enforce access at the data boundary.</figcaption>
          </figure>
        </section>
        <section class="paper-section" id="domains">
          <div><p class="section-number">03</p><h2>Core domains</h2><p class="section-lede">The product is broad, but its capabilities group into six understandable areas.</p></div>
          <div class="domain-grid">
            <article><span>01</span><h3>Event publishing</h3><p>Drafts, guided setup, branded event sites, readiness checks, schedules, tiers, waves, and race series.</p></article>
            <article><span>02</span><h3>Registration</h3><p>Participants, questions, waivers, teams, lotteries, waitlists, transfers, promo codes, and capacity.</p></article>
            <article><span>03</span><h3>Commerce</h3><p>Stripe Checkout, connected organizer payouts, application fees, merchandise, donations, and reconciliation.</p></article>
            <article><span>04</span><h3>Race operations</h3><p>Staff access, QR passes, packet pickup, check-in, bib assignment, walk-ups, volunteers, and fulfillment.</p></article>
            <article><span>05</span><h3>Results &amp; community</h3><p>Timing imports, official results, leaderboards, athlete profiles, series points, and team standings.</p></article>
            <article><span>06</span><h3>Platform operations</h3><p>Health signals, audit logs, payment and email failures, fees, support notes, and event suspension.</p></article>
          </div>
        </section>
        <section class="paper-section" id="flows">
          <div><p class="section-number">04</p><h2>Critical flows</h2><p class="section-lede">Two workflows show the main architectural rule: the browser initiates; the server decides.</p></div>
          <div class="flow-grid">
            <figure class="flow-card"><figcaption><span>PAYMENT FLOW</span><strong>A registration becomes confirmed only after provider verification.</strong></figcaption><ol>
              <li><b>1</b><span><strong>Reserve</strong>The database atomically checks eligibility and capacity.</span></li>
              <li><b>2</b><span><strong>Checkout</strong>An Edge Function creates an idempotent Stripe session.</span></li>
              <li><b>3</b><span><strong>Verify</strong>A signed webhook reports the payment outcome.</span></li>
              <li><b>4</b><span><strong>Confirm</strong>The server records payment, registration, and receipt state.</span></li>
            </ol></figure>
            <figure class="flow-card"><figcaption><span>RACE-DAY FLOW</span><strong>Every scan resolves against current, authorized records.</strong></figcaption><ol>
              <li><b>1</b><span><strong>Assign</strong>An organizer grants a scoped staff role to a verified email.</span></li>
              <li><b>2</b><span><strong>Present</strong>The runner shows a signed QR pass or provides identifying details.</span></li>
              <li><b>3</b><span><strong>Validate</strong>The race-day function checks role, event, and participant state.</span></li>
              <li><b>4</b><span><strong>Record</strong>Pickup, bib, check-in, and fulfillment changes are auditable.</span></li>
            </ol></figure>
          </div>
        </section>
        <section class="paper-section" id="trust">
          <div><p class="section-number">05</p><h2>Trust, privacy &amp; reliability</h2></div>
          <div class="principle-list">
            <article><h3>Server-authoritative invariants</h3><p>Database constraints and functions protect capacity, unique active registrations, publishing readiness, lottery finality, and financial settings—even if a client is stale or modified.</p></article>
            <article><h3>Least-privilege access</h3><p>Row Level Security scopes records to public visitors, account owners, event staff, organizers, and platform operators. Hiding a control in the interface is never treated as authorization.</p></article>
            <article><h3>Idempotent external work</h3><p>Payment sessions, webhooks, campaigns, and background claims are designed to tolerate retries without duplicate charges or sends. Provider events and operational actions remain traceable.</p></article>
            <article><h3>Fast public, bounded private</h3><p>Discovery uses a purpose-built, paged read model. Organizer metrics use counters and summaries; worker claims use bounded batches so platform growth does not turn every screen into a full-table scan.</p></article>
          </div>
        </section>
        <section class="paper-section" id="deployment">
          <div><p class="section-number">06</p><h2>Deployment model</h2></div>
          <div class="deployment-strip" aria-label="Deployment sequence">
            <span><b>Static assets</b>HTML, CSS, JavaScript, manifest</span><i>→</i><span><b>Supabase project</b>Auth, Postgres, storage, functions</span><i>→</i><span><b>Providers</b>Stripe and Resend credentials</span><i>→</i><span><b>Operations</b>Migrations, monitoring, reconciliation</span>
          </div>
          <div class="paper-note"><b>Why this shape?</b><p>The static client is inexpensive to host and easy to inspect. Native ES modules separate content, discovery, shared presentation, and workflow composition without adding a build system. A tiny observable store publishes atomic, named state transitions to focused subscribers, while Postgres centralizes durable consistency and Edge Functions keep secrets and privileged workflows out of the browser.</p></div>
        </section>
        <section class="paper-close"><p class="eyebrow">THE OPERATING IDEA</p><blockquote>Keep the experience welcoming. Keep the important decisions verifiable.</blockquote><button class="subtle-button" data-view="help" type="button">Return to Help</button></section>
      </div>
    </article>`;
}
