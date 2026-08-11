import { escapeHtml } from "../core.js?v=36";
import { helpArticles, showcaseFeatures } from "./content-data.js?v=40";
import { modalShell } from "./render.js?v=62";

export function feedbackForm() {
  const body = `<p class="modal-note">Tell us what blocked you or could work better. Reports may be linked to your account when signed in.</p>
    <form id="feedback-form"><label>Type<select name="category"><option value="bug">Something broke</option><option value="confusing">Something was confusing</option><option value="idea">Feature idea</option><option value="accessibility">Accessibility problem</option><option value="other">Other</option></select></label><label>What happened?<textarea name="message" minlength="20" maxlength="2000" rows="7" required placeholder="What were you trying to do, what happened, and what did you expect?"></textarea></label><p class="form-hint">Do not include names, email addresses, passwords, payment information, API keys, or participant data. Common sensitive patterns are removed automatically.</p><p class="form-message" aria-live="polite"></p><button class="primary-button" type="submit">Send feedback</button></form>`;
  return modalShell({ eyebrow:"Private beta feedback", title:"Help improve OpenStart", body },escapeHtml);
}

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
          <span><button class="primary-button" data-open-feedback type="button">Send private feedback</button><a class="subtle-button" href="https://github.com/jay23606/openstart/issues/new" target="_blank" rel="noreferrer">Open a public GitHub issue</a></span>
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
        <p class="eyebrow">OPENSTART TECHNICAL REPORT · JULY 2026</p>
        <h1>OpenStart: A verifiable architecture for community race operations.</h1>
        <p>This report describes the architecture of an open-source race-management platform designed to keep ordinary interactions simple while making consequential decisions—identity, capacity, money, and results—explicitly verifiable.</p>
        <div class="architecture-facts">
          <span><b>Artifact</b>Open-source web platform</span>
          <span><b>Deployment model</b>Static client + managed backend</span>
          <span><b>Primary datastore</b>PostgreSQL</span>
          <span><b>Design priority</b>Verifiable operations</span>
        </div>
      </header>
      <nav class="architecture-toc" aria-label="Architecture paper sections">
        <a href="#abstract">Abstract</a><a href="#system-map">System model</a><a href="#domains">Domain model</a><a href="#flows">Transaction protocols</a><a href="#trust">Quality attributes</a><a href="#deployment">Deployment</a><a href="#limitations">Limitations</a>
      </nav>
      <div class="architecture-body">
        <section class="paper-section paper-intro" id="abstract">
          <div><p class="section-number">Abstract</p><h2>Purpose and argument</h2></div>
          <div class="paper-abstract"><p>Race-management software must support public discovery, bursty registration, payments, volunteer coordination, race-day check-in, and official results without making small organizing teams operate a complex infrastructure stack. OpenStart addresses that problem with a browser-delivered client, a PostgreSQL system of record, policy-enforced data access, and narrowly scoped server functions.</p><p>The central architectural claim is that a static client can remain inexpensive and inspectable without weakening transactional integrity. Presentation and reversible workflow state remain in the browser; durable invariants and privileged integrations remain at the server boundary. This separation makes the system easier to audit, deploy, and extend while preserving correctness under retries, concurrent edits, and demand spikes.</p><p class="paper-keywords"><b>Keywords:</b> race management, static web application, PostgreSQL, row-level security, optimistic concurrency, payment integrity, open-source software</p></div>
        </section>
        <section class="paper-section" id="system-map">
          <div><p class="section-number">1</p><h2>System model</h2><p class="section-lede">Four actor groups share one application surface, while authorization, durable state, and provider credentials remain server controlled.</p></div>
          <div class="paper-note"><b>Scope and method</b><p>This report is an architectural description of the implemented system rather than a performance benchmark or formal proof. Claims are grounded in repository structure, database constraints, access policies, server functions, and executable tests. Provider availability and organizer operating procedures remain external assumptions.</p></div>
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
          <div><p class="section-number">2</p><h2>Domain model</h2><p class="section-lede">The application is organized into six bounded capability areas that share event identity and authorization rules.</p></div>
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
          <div><p class="section-number">3</p><h2>Transaction protocols</h2><p class="section-lede">Two representative workflows illustrate the governing rule: the browser proposes an operation; the authoritative boundary validates and commits it.</p></div>
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
          <div><p class="section-number">4</p><h2>Quality attributes</h2><p class="section-lede">Security, reliability, scalability, and inspectability are treated as properties of boundaries and invariants rather than interface conventions.</p></div>
          <div class="principle-list">
            <article><h3>Server-authoritative invariants</h3><p>Database constraints and functions protect capacity, unique active registrations, publishing readiness, lottery finality, and financial settings—even if a client is stale or modified.</p></article>
            <article><h3>Least-privilege access</h3><p>Row Level Security scopes records to public visitors, account owners, event staff, organizers, and platform operators. Hiding a control in the interface is never treated as authorization.</p></article>
            <article><h3>Idempotent external work</h3><p>Payment sessions, webhooks, campaigns, and background claims are designed to tolerate retries without duplicate charges or sends. Provider events and operational actions remain traceable.</p></article>
            <article><h3>Fast public, bounded private</h3><p>Discovery uses a purpose-built, paged read model. Organizer metrics use counters and summaries; worker claims use bounded batches so platform growth does not turn every screen into a full-table scan.</p></article>
          </div>
        </section>
        <section class="paper-section" id="deployment">
          <div><p class="section-number">5</p><h2>Deployment model</h2></div>
          <div class="deployment-strip" aria-label="Deployment sequence">
            <span><b>Static assets</b>HTML, CSS, JavaScript, manifest</span><i>→</i><span><b>Supabase project</b>Auth, Postgres, storage, functions</span><i>→</i><span><b>Providers</b>Stripe and Resend credentials</span><i>→</i><span><b>Operations</b>Migrations, monitoring, reconciliation</span>
          </div>
          <div class="paper-note"><b>Why this shape?</b><p>The static client is inexpensive to host and easy to inspect. Native ES modules separate content, discovery, shared presentation, and workflow composition without adding a build system. A tiny observable store publishes atomic, named state transitions to focused subscribers, while Postgres centralizes durable consistency and Edge Functions keep secrets and privileged workflows out of the browser.</p></div>
        </section>
        <section class="paper-section" id="limitations">
          <div><p class="section-number">6</p><h2>Limitations and open questions</h2><p class="section-lede">The architecture reduces operational complexity; it does not eliminate distributed-systems tradeoffs.</p></div>
          <div class="principle-list">
            <article><h3>Provider dependence</h3><p>Payments and outbound email depend on third-party availability and contractual behavior. OpenStart records provider outcomes and supports retries, but it cannot guarantee an external service-level objective.</p></article>
            <article><h3>Offline race operations</h3><p>The installable shell can cache static assets, but authoritative check-in and fulfillment currently require connectivity. A future offline protocol would need conflict-safe local queues, signed snapshots, and reconciliation rules.</p></article>
            <article><h3>Uploaded media conflicts</h3><p>Text settings use local drafts and optimistic concurrency. File selections cannot be restored by the browser, so logos and banners require an independent staging lifecycle before receiving equivalent conflict guarantees.</p></article>
            <article><h3>Empirical evaluation</h3><p>Atomic counters, bounded queries, idempotency, and worker claims are designed for bursts, but production capacity must still be established with representative load tests and operational measurements.</p></article>
          </div>
        </section>
        <section class="paper-section">
          <div><p class="section-number">7</p><h2>Conclusion</h2></div>
          <p class="section-conclusion">OpenStart demonstrates that a race platform does not need a heavy client runtime to support trustworthy operations. Its simplicity comes from assigning each concern to a clear authority: the browser owns interaction, PostgreSQL owns durable truth, server functions own privileged decisions, and external providers own specialized delivery. The resulting system is intended to remain understandable to contributors and dependable for the communities that use it.</p>
        </section>
        <section class="paper-close"><p class="eyebrow">DESIGN THESIS</p><blockquote>Keep the experience welcoming. Keep consequential decisions verifiable.</blockquote><button class="subtle-button" data-view="help" type="button">Return to Help</button></section>
      </div>
    </article>`;
}
