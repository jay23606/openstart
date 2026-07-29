import { proximityRank } from "./discovery.js";

export function createDiscoveryViewModel(state, events, effectivePrice, formatMoney) {
  const region = state.discoverRegion;
  const nearby = Boolean(region?.state);
  const filtered = state.discoverQuery || (nearby && region.state);
  const distancePrices = events.flatMap((event) => (event.os_event_tiers || []).map(effectivePrice));
  return Object.freeze({
    events,
    series: state.series,
    query: state.discoverQuery,
    region,
    nearby,
    total: state.discoverTotal,
    countLabel: `${state.discoverTotal} ${state.discoverTotal === 1 ? "event" : "events"}${filtered ? " found" : " open"}`,
    noneNearby: nearby && !events.some((event) => proximityRank(event, region) < 2),
    remaining: Math.max(0, state.discoverTotal - events.length),
    distanceCount: events.reduce((sum, event) => sum + (event.os_event_tiers || []).length, 0),
    startingPrice: distancePrices.length ? formatMoney(Math.min(...distancePrices)) : "—",
  });
}

export function createEventViewModel(event, preview, registrations, effectivePrice, tierById, formatMoney, now = new Date()) {
  const lottery = event.registration_mode === "lottery";
  const customSite = event.website_published || preview;
  return Object.freeze({
    event,
    preview,
    registrations,
    lottery,
    lotteryOpen: lottery
      && (!event.lottery_opens_at || new Date(event.lottery_opens_at) <= now)
      && (!event.lottery_closes_at || new Date(event.lottery_closes_at) >= now),
    customSite,
    sections: customSite
      ? [...(event.os_event_sections || [])].filter((section) => preview || section.published).sort((a, b) => a.sort_order - b.sort_order)
      : [],
    sponsors: customSite
      ? [...(event.os_event_sponsors || [])].sort((a, b) => a.sort_order - b.sort_order)
      : [],
    tiers: (event.os_event_tiers || []).map((tier) => ({
      ...tier,
      used: registrations.filter((item) => item.tier_id === tier.id).length,
      displayPrice: formatMoney(effectivePrice(tier)),
    })),
    waves: [...(event.os_waves || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .map((wave) => ({ ...wave, tierName: tierById(event, wave.tier_id)?.name || "" })),
  });
}
