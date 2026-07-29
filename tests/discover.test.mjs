import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseRegion, proximityRank, regionLabel, stateFromCoords } from "../modules/discovery.js";

test("parseRegion reads city and state from the free-text location field", () => {
  assert.deepEqual(parseRegion("Boulder, CO"), { city: "boulder", state: "CO" });
  assert.deepEqual(parseRegion("Austin, Texas"), { city: "austin", state: "TX" });
  assert.deepEqual(parseRegion("Central Park, New York, NY"), { city: "new york", state: "NY" });
  // A trailing ZIP must not hide the state code.
  assert.deepEqual(parseRegion("Beverly Hills, CA 90210"), { city: "beverly hills", state: "CA" });
});

test("parseRegion degrades quietly when the text has no usable region", () => {
  assert.deepEqual(parseRegion("The Old Mill Trailhead"), { city: "the old mill trailhead", state: "" });
  assert.deepEqual(parseRegion(""), { city: "", state: "" });
  assert.deepEqual(parseRegion(null), { city: "", state: "" });
});

test("stateFromCoords maps coordinates to the containing state offline", () => {
  assert.equal(stateFromCoords(39.7392, -104.9903), "CO"); // Denver
  assert.equal(stateFromCoords(30.2672, -97.7431), "TX");  // Austin
  assert.equal(stateFromCoords(47.6062, -122.3321), "WA"); // Seattle
  assert.equal(stateFromCoords(25.7617, -80.1918), "FL");  // Miami
  assert.equal(stateFromCoords(21.3069, -157.8583), "HI"); // Honolulu
});

test("proximityRank prefers same city, then same state, then everywhere else", () => {
  const region = { city: "boulder", state: "CO" };
  assert.equal(proximityRank({ location_name: "Boulder, CO" }, region), 0);
  assert.equal(proximityRank({ location_name: "Denver, CO" }, region), 1);
  assert.equal(proximityRank({ location_name: "Austin, TX" }, region), 2);
  // Unparseable locations must not be treated as nearby.
  assert.equal(proximityRank({ location_name: "The Old Mill Trailhead" }, region), 2);
  // With no region chosen every event ranks equally, so date ordering wins.
  assert.equal(proximityRank({ location_name: "Boulder, CO" }, null), 2);
});

test("regionLabel renders a readable chip for state-only and city results", () => {
  assert.equal(regionLabel({ city: "", state: "CO" }), "CO");
  assert.equal(regionLabel({ city: "boulder", state: "CO" }), "Boulder, CO");
});

test("the discovery list stays light and detail data is fetched per event", async () => {
  const data = await readFile(new URL("../data.js", import.meta.url), "utf8");
  const cardSelect = data.match(/const EVENT_CARD_SELECT = "([^"]+)"/);
  const detailSelect = data.match(/const EVENT_DETAIL_SELECT =\s*"([^"]+)"/);
  assert.ok(cardSelect && detailSelect, "data.js must define both event selects");

  // Relations only an event's own page renders must stay out of the list query,
  // otherwise first paint downloads the entire catalogue's nested data again.
  for (const relation of ["os_event_questions", "os_products", "os_volunteer_roles",
    "os_event_sections", "os_event_sponsors", "os_waves", "os_results", "os_teams"]) {
    assert.ok(!cardSelect[1].includes(relation), `${relation} must not be in the discovery list query`);
    assert.ok(detailSelect[1].includes(relation), `${relation} must still load on the detail query`);
  }
  // Cards still price themselves from scheduled tier pricing.
  assert.match(cardSelect[1], /os_event_tiers\(\*, os_tier_prices\(\*\)\)/);
  assert.match(data, /export async function getPublishedEvent/);
  assert.match(data, /os_discover_events/);
  assert.match(data, /p_limit:options\.limit/);

  // Every path that renders an event's detail must hydrate first.
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const publicController = await readFile(new URL("../features/public/controller.js", import.meta.url), "utf8");
  const registration = await readFile(new URL("../features/registration/controller.js", import.meta.url), "utf8");
  assert.match(app, /createPublicController/);
  assert.match(publicController, /async function loadDiscovery\(\)/);
  assert.match(publicController, /request !== state\.discoverRequest/);
  assert.ok(!/matching\.slice\(0, state\.discoverVisible\)/.test(app),
    "discovery paging must happen in Postgres, not after downloading the catalogue");
  const detailFlows = `${app}\n${registration}\n${publicController}`;
  assert.equal((detailFlows.match(/state\.selectedEvent = await hydrateEvent\(/g) || []).length, 3);
  assert.ok(!/state\.selectedEvent = eventById\(/.test(detailFlows),
    "selectedEvent must come from hydrateEvent, not the light list record");
});
