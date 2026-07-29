import assert from "node:assert/strict";
import test from "node:test";
import { parseResultsCsv, rankResults } from "../modules/results.js";

test("rankResults ranks finishers within their distance and division", () => {
  const rows = rankResults([
    { id: "slow", published: true, status: "finisher", tier_id: "5k", division: "F30", chip_time_ms: 2000 },
    { id: "fast", published: true, status: "finisher", tier_id: "5k", division: "F30", chip_time_ms: 1000 },
    { id: "dnf", published: true, status: "dnf", tier_id: "5k", division: "F30" },
    { id: "private", published: false, status: "finisher", tier_id: "5k", chip_time_ms: 500 },
  ]);

  assert.deepEqual(rows.map((row) => row.id), ["fast", "slow", "dnf"]);
  assert.deepEqual(rows.map((row) => row.overallPlace), [1, 2, null]);
  assert.deepEqual(rows.map((row) => row.divisionPlace), [1, 2, null]);
});

test("parseResultsCsv supports quoted values and resolves bibs", () => {
  const rows = parseResultsCsv(
    'bib,chip_time,gun_time,status,division\n101,24:31,25:02,finisher,"F, 30-39"',
    [{ id: "registration-1", bib_number: "101" }],
    (value) => value ? value.length : null,
  );

  assert.deepEqual(rows, [{
    registrationId: "registration-1",
    chipTimeMs: 5,
    gunTimeMs: 5,
    status: "finisher",
    division: "F, 30-39",
  }]);
});
