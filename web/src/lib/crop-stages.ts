/** The ten rice crop stages, in the order a crop moves through them. */
export type GrowthStage =
  | 'LAND_PREPARATION'
  | 'NURSERY_PREPARATION'
  | 'PLANTING'
  | 'VEGETATIVE_GROWTH'
  | 'TILLERING'
  | 'FLOWERING'
  | 'GRAIN_FILLING'
  | 'MATURITY'
  | 'HARVEST'
  | 'POST_HARVEST';

export const GROWTH_STAGES: { key: GrowthStage; label: string; short: string }[] = [
  { key: 'LAND_PREPARATION', label: 'Land preparation', short: 'Land prep' },
  { key: 'NURSERY_PREPARATION', label: 'Nursery preparation', short: 'Nursery' },
  { key: 'PLANTING', label: 'Transplanting / direct seeding', short: 'Planting' },
  { key: 'VEGETATIVE_GROWTH', label: 'Vegetative growth', short: 'Vegetative' },
  { key: 'TILLERING', label: 'Tillering', short: 'Tillering' },
  { key: 'FLOWERING', label: 'Flowering', short: 'Flowering' },
  { key: 'GRAIN_FILLING', label: 'Grain filling', short: 'Grain fill' },
  { key: 'MATURITY', label: 'Maturity', short: 'Maturity' },
  { key: 'HARVEST', label: 'Harvesting', short: 'Harvest' },
  { key: 'POST_HARVEST', label: 'Post-harvest', short: 'Post-harvest' },
];

/** Older clients still report these; they sit under the step they belong to. */
const LEGACY: Record<string, GrowthStage> = {
  GERMINATION: 'VEGETATIVE_GROWTH',
  PANICLE_INITIATION: 'TILLERING',
};

export const stageIndex = (stage?: string | null) => {
  if (!stage) return -1;
  const key = (LEGACY[stage] ?? stage) as GrowthStage;
  return GROWTH_STAGES.findIndex((s) => s.key === key);
};

export const stageLabel = (stage?: string | null) => {
  const i = stageIndex(stage);
  return i >= 0 ? GROWTH_STAGES[i].label : 'Not recorded';
};

export const PRODUCTION_METHODS: Record<string, string> = {
  TRANSPLANTING: 'Transplanting',
  DIRECT_SEEDING: 'Direct seeding',
  SRI: 'System of Rice Intensification (SRI)',
};

export const IRRIGATION_TYPES: Record<string, string> = {
  RAIN_FED: 'Rain-fed',
  CANAL_GRAVITY: 'Canal (gravity-fed)',
  PUMP: 'Pump irrigation',
  SPRINKLER: 'Sprinkler',
  SUPPLEMENTAL: 'Supplemental irrigation',
};

export const CYCLE_STATUSES = ['PLANNED', 'ACTIVE', 'HARVESTED', 'COMPLETED'] as const;

export const statusBadgeClass = (status: string) =>
  ({ PLANNED: 'badge-gray', ACTIVE: 'badge-green', HARVESTED: 'badge-gold', COMPLETED: 'badge-blue' }[status] || 'badge-gray');

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtKg = (n?: number | null) => (n || n === 0 ? `${Math.round(n).toLocaleString()} kg` : '—');
