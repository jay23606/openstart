import { displayDate, escapeHtml, eventDay, eventMonth, money } from "../core.js?v=36";
import { raceTypeFor, regionLabel } from "./discovery.js?v=40";
import { createDiscoveryViewModel, createEventViewModel } from "./public-view-models.js?v=79";
import { contentHtml, safeColor, safeUrl } from "./ui.js?v=40";

export function createPublicViews({ effectivePrice, eventRegistrations, tierById }) {
  function eventCard(event, index) {
    const tiers = event.os_event_tiers || [];
    const raceType = raceTypeFor(tiers);
    return `
      <article class="event-card event-tone-${index % 3}" style="--event-accent:${safeColor(event.primary_color)}">
        <div class="event-date"><span>${eventMonth(event.starts_at)}</span><strong>${eventDay(event.starts_at)}</strong></div>
        <div class="event-card-content">
          <div class="event-card-kicker"><p>${escapeHtml(event.location_name)}</p><span class="race-type race-type-${raceType.kind}" title="${raceType.kind} race">${raceType.label}</span></div>
          <h3>${escapeHtml(event.name)}</h3>
          <div class="tier-pills">${tiers.map((tier) => `<span>${escapeHtml(tier.distance_label)}</span>`).join("")}</div>
          <button data-event-id="${event.id}" type="button">View event <span>→</span></button>
        </div>
      </article>`;
  }

  function discoveryResults(model) {
    return `
      ${model.noneNearby ? `<p class="discover-empty">No events near ${escapeHtml(regionLabel(model.region))} yet — showing the soonest events everywhere.</p>` : ""}
      <div class="event-grid">${model.events.map(eventCard).join("")}</div>
      ${model.remaining ? `<div class="discover-more"><button class="subtle-button" data-show-more type="button">Show more events (${model.remaining} remaining)</button></div>` : ""}
      ${model.total === 0 ? '<p class="discover-empty">No events match that search.</p>' : ""}`;
  }

  function discoveryPage(model) {
    return `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Registration without the runaround</p>
          <h1>Great race days start in the open.</h1>
          <p class="hero-lede">Discover local events and register in minutes. OpenStart gives organizers a transparent, community-owned alternative for managing every starting line.</p>
          <div class="hero-actions"><a class="primary-button" href="#events">Explore events</a><button class="text-button" data-go-dashboard type="button">I organize races →</button></div>
        </div>
        <div class="hero-photo">
          <img src="assets/openstart-race-hero.png" width="1536" height="1024" alt="A community road race beginning at sunrise">
          <div class="hero-photo-shade"></div>
          <div class="route-line"><span>START</span><i></i><span>FINISH</span></div>
          <div class="hero-photo-caption"><p>Up next</p><strong>${escapeHtml(model.events[0]?.name || "Your next race")}</strong></div>
          <div class="hero-meta"><span><b>${model.total}</b> events</span><span><b>${model.distanceCount}</b> visible distances</span><span><b>${model.startingPrice}</b> from</span></div>
        </div>
      </section>
      <section class="events-section" id="events">
        <div class="section-heading"><div><p class="eyebrow">On the calendar</p><h2>Find your next starting line</h2></div><span id="discover-count">${model.countLabel}</span></div>
        <div class="discover-controls">
          <input id="discover-search" type="search" placeholder="Search races or places" value="${escapeHtml(model.query)}" aria-label="Search events by name or location">
          <div class="discover-location">
            ${model.nearby
              ? `<span class="location-chip">Near ${escapeHtml(regionLabel(model.region))}<button data-clear-location type="button" aria-label="Clear location">×</button></span>`
              : `<button class="subtle-button" data-use-location type="button">Use my location</button>
                 <input id="discover-place" placeholder="or enter a city or state" aria-label="Enter your city or state">`}
          </div>
        </div>
        <div id="discover-results">${discoveryResults(model)}</div>
      </section>
      ${model.series.length ? `<section class="series-section"><div class="section-heading"><div><p class="eyebrow">Race more</p><h2>Series & championships</h2></div><span>${model.series.length} active series</span></div><div class="series-grid">${model.series.map((series) => `<article style="--series-color:${safeColor(series.primary_color)}">${safeUrl(series.banner_url) ? `<img src="${escapeHtml(safeUrl(series.banner_url))}" alt="">` : ""}<div><p>${series.os_series_events?.length || 0} events</p><h3>${escapeHtml(series.name)}</h3><span>${escapeHtml(series.description)}</span><button data-view-series="${series.id}" type="button">View series standings →</button></div></article>`).join("")}</div></section>` : ""}
      <section class="open-promise">
        <div><p class="eyebrow">Built differently</p><h2>Your event platform should work for your community.</h2></div>
        <div class="promise-grid">
          <div><b>01</b><h3>Transparent by default</h3><p>Open code, understandable costs, and participant data that stays yours.</p></div>
          <div><b>02</b><h3>Ready for race day</h3><p>Registration, rosters, capacity, and exports in one focused workspace.</p></div>
          <div><b>03</b><h3>Made to extend</h3><p>Build the workflow your event needs without waiting on a closed platform.</p></div>
        </div>
      </section>`;
  }

  function eventPage(model) {
    const { event } = model;
    return `
      <section class="event-detail" style="--event-color:${safeColor(event.primary_color)}">
        <button class="back-button" data-back type="button">← All events</button>
        ${model.customSite && safeUrl(event.banner_url) ? `<div class="event-banner"><img src="${escapeHtml(safeUrl(event.banner_url))}" alt=""></div>` : ""}
        <div class="detail-hero">
          <div>${model.customSite && safeUrl(event.logo_url) ? `<img class="event-logo" src="${escapeHtml(safeUrl(event.logo_url))}" alt="${escapeHtml(event.name)} logo">` : ""}<p class="eyebrow">${displayDate(event.starts_at)} · ${escapeHtml(event.location_name)}</p><h1>${escapeHtml(event.name)}</h1><p>${escapeHtml(event.description)}</p></div>
          <div class="start-badge"><span>OPEN</span><strong>START</strong></div>
        </div>
        <div class="detail-layout">
          <div>
            <h2>${model.lottery ? "Lottery race options" : "Choose your event"}</h2>
            <div class="tier-list">
              ${model.tiers.map((tier) => `<div class="tier-row"><div><h3>${escapeHtml(tier.name)}</h3><p>${escapeHtml(tier.distance_label)} · capacity ${tier.capacity}${tier.used ? ` · ${tier.used} registered` : ""}</p></div><strong>${tier.displayPrice}</strong></div>`).join("")}
            </div>
            <div class="event-secondary-actions">${event.results_published_at ? `<button class="subtle-button results-link" data-view-results="${event.id}" type="button">View official results</button>` : ""}${event.os_volunteer_roles?.length ? `<button class="subtle-button results-link" data-volunteer="${event.id}" type="button">Volunteer</button>` : ""}</div>
            <div class="detail-note"><b>Simple for now, extensible later.</b><p>Registration is connected. Paid entries remain pending until a payment provider confirms them server-side.</p></div>
          </div>
          <aside class="registration-panel">
            ${model.lottery ? `
              <p>${model.lotteryOpen ? "Lottery applications are open" : "Lottery application period"}</p>
              <h2>${model.lotteryOpen ? "Enter the lottery" : "Applications are closed"}</h2>
              <span>${event.lottery_spots ? `${event.lottery_spots} available spots. ` : ""}${event.qualifier_required ? "A qualifying result is required. " : ""}${event.lottery_closes_at ? `Applications close ${displayDate(event.lottery_closes_at)}.` : ""}</span>
              ${model.lotteryOpen ? `<button class="primary-button" data-apply-lottery="${event.id}" type="button">Apply to lottery</button>` : ""}
            ` : event.registration_mode === "closed" ? `
              <p>Registration</p><h2>Registration is closed</h2><span>Check back for updates from the organizer.</span>
            ` : `
              <p>Registration is open</p><h2>Claim your spot</h2>
              <span>Complete registration and use Stripe Checkout for paid entries.</span>
              <button class="primary-button" data-register="${event.id}" type="button">Register now</button>
            `}
          </aside>
        </div>
        ${model.waves.length ? `<section class="public-start-list"><p class="eyebrow">Start plan</p><h2>Waves & corrals</h2><div>${model.waves.map((wave) => `<span><b>${new Date(wave.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b><strong>${escapeHtml(wave.name)}</strong><small>${escapeHtml(wave.tierName)} · capacity ${wave.capacity}</small></span>`).join("")}</div></section>` : ""}
        ${model.sections.length ? `<div class="event-content-sections">${model.sections.map((section) => `<article class="event-content-${section.section_type}"><p class="eyebrow">${escapeHtml(section.section_type.replace("_", " "))}</p><h2>${escapeHtml(section.title)}</h2><div>${contentHtml(section.content)}</div>${safeUrl(section.link_url) ? `<a class="subtle-button" href="${escapeHtml(safeUrl(section.link_url))}" target="_blank" rel="noopener">${escapeHtml(section.link_label || "Learn more")}</a>` : ""}</article>`).join("")}</div>` : ""}
        ${model.sponsors.length ? `<section class="event-sponsors"><p class="eyebrow">Event partners</p><h2>Thank you to our sponsors</h2><div>${model.sponsors.map((sponsor) => `<a href="${escapeHtml(safeUrl(sponsor.website_url) || "#")}" ${safeUrl(sponsor.website_url) ? 'target="_blank" rel="noopener"' : ""}>${safeUrl(sponsor.logo_url) ? `<img src="${escapeHtml(safeUrl(sponsor.logo_url))}" alt="${escapeHtml(sponsor.name)}">` : `<b>${escapeHtml(sponsor.name)}</b>`}<small>${escapeHtml(sponsor.sponsor_level)}</small></a>`).join("")}</div></section>` : ""}
      </section>`;
  }

  return {
    discoveryModel: (state, events) => createDiscoveryViewModel(state, events, effectivePrice, money),
    discoveryPage,
    discoveryResults,
    eventModel: (event, preview = false) => createEventViewModel(event, preview, eventRegistrations(event.id), effectivePrice, tierById, money),
    eventPage,
  };
}
