import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryViewModel, createEventViewModel } from "../modules/public-view-models.js";

const formatMoney = (cents) => `$${cents / 100}`;
const effectivePrice = (tier) => tier.sale_price_cents ?? tier.price_cents;

test("discovery view models derive paging, location, and pricing without mutating app state", () => {
  const events = [
    {
      id: "near",
      location_name: "Boulder, CO",
      os_event_tiers: [
        { price_cents: 5000, sale_price_cents: 3500 },
        { price_cents: 7000 },
      ],
    },
    {
      id: "far",
      location_name: "Austin, TX",
      os_event_tiers: [{ price_cents: 2500 }],
    },
  ];
  const state = {
    discoverQuery: "trail",
    discoverRegion: { city: "boulder", state: "CO" },
    discoverTotal: 8,
    series: [{ id: "series-1" }],
  };

  const model = createDiscoveryViewModel(state, events, effectivePrice, formatMoney);

  assert.equal(model.countLabel, "8 events found");
  assert.equal(model.remaining, 6);
  assert.equal(model.distanceCount, 3);
  assert.equal(model.startingPrice, "$25");
  assert.equal(model.noneNearby, false);
  assert.equal(model.events, events);
  assert.equal(model.series, state.series);
  assert.ok(Object.isFrozen(model));
});

test("discovery view models distinguish empty nearby results from an empty catalogue", () => {
  const state = {
    discoverQuery: "",
    discoverRegion: { city: "boulder", state: "CO" },
    discoverTotal: 1,
    series: [],
  };
  const model = createDiscoveryViewModel(
    state,
    [{ location_name: "Austin, TX", os_event_tiers: [] }],
    effectivePrice,
    formatMoney,
  );

  assert.equal(model.countLabel, "1 event found");
  assert.equal(model.noneNearby, true);
  assert.equal(model.startingPrice, "—");
});

test("event view models centralize availability, capacity, site visibility, and ordering", () => {
  const event = {
    id: "event-1",
    registration_mode: "lottery",
    lottery_opens_at: "2026-01-01T00:00:00Z",
    lottery_closes_at: "2026-12-31T23:59:59Z",
    website_published: true,
    os_event_tiers: [
      { id: "tier-1", price_cents: 5000, sale_price_cents: 4000 },
      { id: "tier-2", price_cents: 3000 },
    ],
    os_event_sections: [
      { id: "hidden", published: false, sort_order: 0 },
      { id: "second", published: true, sort_order: 2 },
      { id: "first", published: true, sort_order: 1 },
    ],
    os_event_sponsors: [
      { id: "second", sort_order: 2 },
      { id: "first", sort_order: 1 },
    ],
    os_waves: [
      { id: "later", tier_id: "tier-2", starts_at: "2026-05-01T09:00:00Z" },
      { id: "earlier", tier_id: "tier-1", starts_at: "2026-05-01T08:00:00Z" },
    ],
  };
  const registrations = [
    { id: "one", tier_id: "tier-1" },
    { id: "two", tier_id: "tier-1" },
  ];
  const tierById = (source, id) => source.os_event_tiers.find((tier) => tier.id === id);
  const model = createEventViewModel(
    event,
    false,
    registrations,
    effectivePrice,
    tierById,
    formatMoney,
    new Date("2026-06-01T00:00:00Z"),
  );

  assert.equal(model.lottery, true);
  assert.equal(model.lotteryOpen, true);
  assert.deepEqual(model.sections.map((section) => section.id), ["first", "second"]);
  assert.deepEqual(model.sponsors.map((sponsor) => sponsor.id), ["first", "second"]);
  assert.deepEqual(model.waves.map((wave) => wave.id), ["earlier", "later"]);
  assert.equal(model.waves[0].tierName, "");
  assert.equal(model.tiers[0].used, 2);
  assert.equal(model.tiers[0].displayPrice, "$40");
  assert.ok(Object.isFrozen(model));
});

test("event preview exposes draft site sections without opening a closed lottery", () => {
  const event = {
    id: "event-2",
    registration_mode: "lottery",
    lottery_opens_at: "2027-01-01T00:00:00Z",
    website_published: false,
    os_event_tiers: [],
    os_event_sections: [{ id: "draft", published: false, sort_order: 1 }],
    os_event_sponsors: [],
    os_waves: [],
  };
  const model = createEventViewModel(
    event,
    true,
    [],
    effectivePrice,
    () => null,
    formatMoney,
    new Date("2026-06-01T00:00:00Z"),
  );

  assert.equal(model.customSite, true);
  assert.equal(model.sections.length, 1);
  assert.equal(model.lotteryOpen, false);
});
