export const RICE_GROWTH_STAGES = [
  'LAND_PREPARATION',
  'NURSERY_PREPARATION',
  'PLANTING',
  'VEGETATIVE_GROWTH',
  'TILLERING',
  'FLOWERING',
  'GRAIN_FILLING',
  'MATURITY',
  'HARVEST',
  'POST_HARVEST',
] as const;

export type RiceGrowthStage = (typeof RICE_GROWTH_STAGES)[number];

export const FIELD_CONDITION_STATUSES = ['GOOD', 'FAIR', 'POOR', 'NONE'] as const;

export type FieldConditionStatus = (typeof FIELD_CONDITION_STATUSES)[number];

export type FieldVisitPayload = {
  farmerId: string;
  farmId: string;
  cropCycleId?: string;
  purpose?: 'ROUTINE_CHECK' | 'FARMING_ASSISTANCE' | 'VERIFICATION' | 'DISPUTE_FOLLOWUP' | 'TRAINING' | 'OTHER';
  visitedAt?: string;
  growthStage: RiceGrowthStage;
  riceVariety?: string;
  cropCondition: FieldConditionStatus;
  waterStatus?: FieldConditionStatus;
  weedStatus?: FieldConditionStatus;
  pestStatus?: FieldConditionStatus;
  diseaseStatus?: FieldConditionStatus;
  fertilizerApplied?: boolean;
  inputUsed?: string;
  inputQuantity?: string;
  observations?: string;
  recommendations?: string;
  nextVisitDate?: string;
  photoUrls?: string[];
  gpsLatitude?: number;
  gpsLongitude?: number;
};

/** Includes the two older stage names so visits recorded before the ten-step list still show a label. */
export const STAGE_LABEL_KEYS: Record<RiceGrowthStage | 'GERMINATION' | 'PANICLE_INITIATION', string> = {
  LAND_PREPARATION: 'stageLandPreparation',
  NURSERY_PREPARATION: 'stageNurseryPreparation',
  PLANTING: 'stagePlanting',
  VEGETATIVE_GROWTH: 'stageVegetativeGrowth',
  GERMINATION: 'stageGermination',
  TILLERING: 'stageTillering',
  PANICLE_INITIATION: 'stagePanicleInitiation',
  FLOWERING: 'stageFlowering',
  GRAIN_FILLING: 'stageGrainFilling',
  MATURITY: 'stageMaturity',
  HARVEST: 'stageHarvest',
  POST_HARVEST: 'stagePostHarvest',
};

export const CONDITION_LABEL_KEYS: Record<FieldConditionStatus, string> = {
  GOOD: 'conditionGood',
  FAIR: 'conditionFair',
  POOR: 'conditionPoor',
  NONE: 'conditionNone',
};

export function growthStageLabel(stage: keyof typeof STAGE_LABEL_KEYS, t: (key: string) => string) {
  return t(STAGE_LABEL_KEYS[stage]);
}

export function conditionLabel(status: FieldConditionStatus, t: (key: string) => string) {
  return t(CONDITION_LABEL_KEYS[status]);
}
