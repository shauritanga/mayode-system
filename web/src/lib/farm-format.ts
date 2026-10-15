/** Display helpers shared by the Farms list, farm detail and map. */

export const ACRES_PER_HECTARE = 2.47105;

export const OWNERSHIP_LABELS: Record<string, string> = {
  OWNED: 'Owned',
  RENTED: 'Rented',
  LEASED: 'Leased',
  COMMUNAL: 'Communal',
  INHERITED: 'Inherited',
};

type FarmLike = {
  region?: string | null;
  district?: string | null;
  ward?: string | null;
  village?: string | null;
  subVillage?: string | null;
  hasIrrigation?: boolean;
  ownershipType?: string | null;
  landTenure?: string | null;
  plots?: { sizeAcres?: number | null }[];
  cropCycles?: { riceVariety?: string | null; status?: string | null }[];
};

/** "Village, Ward, District, Region" – most specific first, blanks skipped. */
export function locationLabel(farm: FarmLike) {
  return [farm.subVillage, farm.village, farm.ward, farm.district, farm.region].filter(Boolean).join(', ') || '—';
}

export const productionLabel = (farm: FarmLike) => (farm.hasIrrigation ? 'Irrigated' : 'Rain-fed');

export const tenureLabel = (farm: FarmLike) => {
  const type = farm.ownershipType ? OWNERSHIP_LABELS[farm.ownershipType] || farm.ownershipType : '';
  return [type, farm.landTenure].filter(Boolean).join(' · ') || '—';
};

/** Distinct rice varieties across a farm's crop cycles, active/planned cycles first. */
export function riceVarieties(farm: FarmLike): string[] {
  const cycles = [...(farm.cropCycles || [])].sort(
    (a, b) => Number(['ACTIVE', 'PLANNED'].includes(b.status || '')) - Number(['ACTIVE', 'PLANNED'].includes(a.status || '')),
  );
  return [...new Set(cycles.map((c) => c.riceVariety).filter((v): v is string => !!v))];
}

export const acresToHectares = (acres?: number | null) => (acres ? acres / ACRES_PER_HECTARE : 0);

export function totalPlotHectares(farm: FarmLike) {
  return acresToHectares((farm.plots || []).reduce((sum, p) => sum + (p.sizeAcres || 0), 0));
}

export const fmtHa = (n?: number | null) => `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`;

export const fmtCoord = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—';

/** Quote-safe CSV from rows of already-stringified cells. */
export function toCsv(header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
