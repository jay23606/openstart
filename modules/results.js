export function rankResults(results = []) {
  const tierPlaces = new Map();
  const divisionPlaces = new Map();
  return results.filter((item) => item.published).sort((a, b) => {
    if (a.status === "finisher" && b.status !== "finisher") return -1;
    if (a.status !== "finisher" && b.status === "finisher") return 1;
    return (a.chip_time_ms ?? a.gun_time_ms ?? Infinity) - (b.chip_time_ms ?? b.gun_time_ms ?? Infinity);
  }).map((item) => {
    if (item.status !== "finisher") {
      return { ...item, overallPlace: null, tierPlace: null, divisionPlace: null };
    }
    const tierPlace = (tierPlaces.get(item.tier_id) || 0) + 1;
    tierPlaces.set(item.tier_id, tierPlace);
    const divisionKey = `${item.tier_id}:${item.division || ""}`;
    const divisionPlace = (divisionPlaces.get(divisionKey) || 0) + 1;
    divisionPlaces.set(divisionKey, divisionPlace);
    return {
      ...item,
      overallPlace: tierPlace,
      tierPlace,
      divisionPlace: item.division ? divisionPlace : null,
    };
  });
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += character;
  }
  cells.push(value.trim());
  return cells;
}

export function parseResultsCsv(text, registrations, parseTime) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The CSV has no result rows");
  const headers = parseCsvLine(lines[0]).map((item) => item.toLowerCase());
  if (!headers.includes("bib") || !headers.includes("chip_time")) {
    throw new Error("CSV must include bib and chip_time columns");
  }
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const registration = registrations.find((item) => String(item.bib_number) === row.bib);
    if (!registration) throw new Error(`Bib ${row.bib} was not found`);
    return {
      registrationId: registration.id,
      chipTimeMs: parseTime(row.chip_time),
      gunTimeMs: parseTime(row.gun_time),
      status: (row.status || "finisher").toLowerCase(),
      division: row.division || null,
    };
  });
}
