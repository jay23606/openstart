import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The discovery helpers live in app.js, which is a browser module wired to the
// DOM. Pull the pure region helpers out by evaluating just their source so the
// matching rules can be verified without a browser.
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const slice = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from !== -1 && to !== -1, `could not locate ${start} in app.js`);
  return source.slice(from, to);
};
const helpers = slice("const STATE_BOXES", "const DISCOVER_PAGE_SIZE");
const { parseRegion, stateFromCoords, proximityRank, regionLabel } =
  await import(`data:text/javascript,${encodeURIComponent(`${helpers}
    export { parseRegion, stateFromCoords, proximityRank, regionLabel };`)}`);

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
