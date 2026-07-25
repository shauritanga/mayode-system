import data from './tanzania-locations.json';

/**
 * Tanzania administrative hierarchy (2022 census), bundled with the app so it is
 * available offline from first launch: region -> { district -> [wards] }.
 *
 * District display names drop the "... Council" suffix. Normally only the bare
 * name is shown (e.g. "Nsimbo"); when two districts in the same region would
 * collide (e.g. "Kondoa District Council" & "Kondoa Town Council") the type word
 * is kept — but never the word "Council" — giving "Kondoa District" / "Kondoa Town".
 */
type LocationData = Record<string, Record<string, string[]>>;
const LOCATIONS = data as LocationData;

function clean(name: string): string {
  return name.replace(/[\s,]+$/, '').trim(); // drop trailing commas/whitespace from source data
}
function withoutCouncil(name: string): string {
  return clean(name).replace(/\s+Council$/i, '').trim(); // "Kondoa District", "Mbeya City", "Nsimbo District"
}
function baseName(name: string): string {
  return withoutCouncil(name)
    .replace(/\s+(District|Town|City|Municipal)$/i, '')
    .trim(); // "Kondoa", "Mbeya", "Nsimbo"
}

interface DistrictEntry {
  key: string; // original JSON key (used to look up wards)
  display: string; // user-facing name (no "Council")
}

// Per-region: display name -> original key, and the sorted display list.
const districtCache: Record<string, { entries: DistrictEntry[]; byDisplay: Record<string, string> }> = {};

function buildRegion(region: string) {
  if (districtCache[region]) return districtCache[region];
  const keys = Object.keys(LOCATIONS[region] || {});
  const baseCounts: Record<string, number> = {};
  for (const k of keys) {
    const b = baseName(k);
    baseCounts[b] = (baseCounts[b] || 0) + 1;
  }
  const entries: DistrictEntry[] = keys.map((key) => {
    const b = baseName(key);
    // Keep the distinguishing type word only when the bare name collides.
    const display = baseCounts[b] > 1 ? withoutCouncil(key) : b;
    return { key, display };
  });
  const byDisplay: Record<string, string> = {};
  for (const e of entries) byDisplay[e.display] = e.key;
  districtCache[region] = { entries, byDisplay };
  return districtCache[region];
}

export function getRegions(): string[] {
  return Object.keys(LOCATIONS).sort();
}

export function getDistricts(region?: string | null): string[] {
  if (!region || !LOCATIONS[region]) return [];
  return buildRegion(region).entries.map((e) => e.display).sort();
}

export function getWards(region?: string | null, district?: string | null): string[] {
  if (!region || !district || !LOCATIONS[region]) return [];
  const key = buildRegion(region).byDisplay[district] || district;
  const wards = LOCATIONS[region][key];
  return wards ? [...wards].sort() : [];
}

/** Total counts (handy for a seeding/log confirmation). */
export function locationCounts() {
  const regions = Object.keys(LOCATIONS).length;
  let districts = 0;
  let wards = 0;
  for (const r of Object.values(LOCATIONS)) {
    districts += Object.keys(r).length;
    for (const w of Object.values(r)) wards += w.length;
  }
  return { regions, districts, wards };
}
