export type ProductKey = 'AREA_YIELD' | 'WEATHER_INDEX' | 'MULTI_PERIL' | 'INPUT_INSURANCE' | 'CREDIT_LINKED';

export interface ProductGuideEntry {
  key: ProductKey;
  name: string;
  summary: string;
  paysWhen: string;
  bestFor: string;
  sumInsuredBasis: string;
}

/** Plain-language description of each product, shown when applying. */
export const PRODUCT_GUIDE: ProductGuideEntry[] = [
  {
    key: 'AREA_YIELD',
    name: 'Area-yield insurance',
    summary: 'Pays when the average yield of your area falls below an agreed level, whatever happens on your own farm.',
    paysWhen: 'The area’s measured average yield is below the guaranteed yield.',
    bestFor: 'Farmers in a scheme or village where yields are measured by crop-cutting.',
    sumInsuredBasis: 'About 70% of the harvest you expect from the insured area.',
  },
  {
    key: 'WEATHER_INDEX',
    name: 'Weather-index insurance',
    summary: 'Pays automatically when rainfall or temperature crosses an agreed limit, for example a drought or flood.',
    paysWhen: 'A weather reading (rainfall, dry spell, flood level) passes the trigger, without a farm visit.',
    bestFor: 'Rain-fed rice and farms far from roads, where inspections are slow.',
    sumInsuredBasis: 'About 70% of the harvest you expect from the insured area.',
  },
  {
    key: 'MULTI_PERIL',
    name: 'Multi-peril crop insurance',
    summary: 'Covers loss of your own crop from several named causes: drought, flood, pests, disease and fire.',
    paysWhen: 'An inspector confirms the loss on your farm after you report it.',
    bestFor: 'Farmers who want the widest cover for their own field.',
    sumInsuredBasis: 'About 70% of the harvest you expect from the insured area.',
  },
  {
    key: 'INPUT_INSURANCE',
    name: 'Input insurance',
    summary: 'Protects the money spent on seed, fertiliser and other inputs if the crop fails.',
    paysWhen: 'The crop fails or is destroyed early in the season.',
    bestFor: 'Farmers buying inputs on credit or spending heavily at planting.',
    sumInsuredBasis: 'What you spend on inputs for the insured area.',
  },
  {
    key: 'CREDIT_LINKED',
    name: 'Credit-linked crop insurance',
    summary: 'Cover tied to a loan: if the crop fails, the payout clears the loan first.',
    paysWhen: 'A covered loss happens while the loan is outstanding.',
    bestFor: 'Farmers with a loan from a bank or lender.',
    sumInsuredBasis: 'The loan still owed, or 70% of expected harvest if there is none.',
  },
];

const roundThousand = (n: number) => Math.round(n / 1000) * 1000;

/** A starting figure for the sum insured; the insurer sets the real one. */
export function suggestSumInsured(
  product: ProductKey,
  areaHa: number,
  revenuePerHa: number | null,
  inputCostPerHa: number | null,
  loanOutstanding = 0,
): number | null {
  if (areaHa <= 0) return null;
  const revenue = revenuePerHa ? 0.7 * revenuePerHa * areaHa : null;
  if (product === 'INPUT_INSURANCE') return inputCostPerHa ? roundThousand(inputCostPerHa * areaHa) : null;
  if (product === 'CREDIT_LINKED') return loanOutstanding > 0 ? roundThousand(loanOutstanding) : revenue ? roundThousand(revenue) : null;
  return revenue ? roundThousand(revenue) : null;
}

export interface RiskInputs {
  droughtAlerts: number;
  floodAlerts: number;
  pestOrDiseaseAlerts: number;
  severeAlerts: number;
  priorClaims: number;
  hasIrrigation: boolean | null;
  harvests: number;
  yieldCv: number | null;
}
export interface RiskFactor {
  label: string;
  points: number;
  detail: string;
}

/** Coefficient of variation of yields per hectare; null with fewer than two readings. */
export function yieldCv(yieldsPerHa: number[]): number | null {
  const v = yieldsPerHa.filter((y) => y > 0);
  if (v.length < 2) return null;
  const mean = v.reduce((t, y) => t + y, 0) / v.length;
  const variance = v.reduce((t, y) => t + (y - mean) ** 2, 0) / v.length;
  return mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100) / 100 : null;
}

export function assessRisk(i: RiskInputs): { level: 'LOW' | 'MEDIUM' | 'HIGH'; score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = [];
  const add = (label: string, points: number, detail: string) => points !== 0 && factors.push({ label, points, detail });
  add('Drought warnings in the area', i.droughtAlerts >= 3 ? 25 : i.droughtAlerts >= 1 ? 10 : 0, `${i.droughtAlerts} in the last 12 months`);
  add('Flood warnings in the area', i.floodAlerts >= 3 ? 20 : i.floodAlerts >= 1 ? 8 : 0, `${i.floodAlerts} in the last 12 months`);
  add('Pest and disease warnings', i.pestOrDiseaseAlerts >= 2 ? 10 : 0, `${i.pestOrDiseaseAlerts} in the last 12 months`);
  add('Severe weather alerts', i.severeAlerts >= 2 ? 10 : 0, `${i.severeAlerts} high or critical`);
  add('Earlier claims by this farmer', i.priorClaims >= 2 ? 15 : i.priorClaims === 1 ? 6 : 0, `${i.priorClaims} claim${i.priorClaims === 1 ? '' : 's'} filed`);
  add('No irrigation', i.hasIrrigation === false ? 10 : 0, 'Rain-fed farm');
  add('Irrigated farm', i.hasIrrigation ? -8 : 0, 'Water is available in dry spells');
  add('Uneven yields', i.yieldCv != null && i.yieldCv > 0.35 ? 15 : i.yieldCv != null && i.yieldCv > 0.2 ? 7 : 0, `Yields vary by ${Math.round((i.yieldCv ?? 0) * 100)}% between seasons`);
  add('No harvest record', i.harvests === 0 ? 8 : 0, 'No history to judge the farm by');
  const score = Math.max(0, factors.reduce((t, f) => t + f.points, 0));
  return { level: score < 25 ? 'LOW' : score < 50 ? 'MEDIUM' : 'HIGH', score, factors };
}

const NEXT: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['ACTIVATED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  ACTIVATED: [],
  WITHDRAWN: [],
};
export const canMoveInsuranceApplication = (from: string, to: string) => (NEXT[from] ?? []).includes(to);

export function nextInsuranceReference(year: number, last?: string | null): string {
  const n = last ? parseInt(last.split('-')[2] ?? '0', 10) : 0;
  return `IA-${year}-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
}

export type ClaimPayment = 'NOT_DUE' | 'PENDING' | 'PARTIAL' | 'PAID';
/** Where a claim stands on payment: nothing is due until the insurer approves an amount. */
export function claimPaymentStatus(c: { status: string; approvedAmount?: number | null; paidAmount?: number | null }): ClaimPayment {
  if (c.status === 'REJECTED' || c.approvedAmount == null || c.approvedAmount <= 0) return 'NOT_DUE';
  const paid = c.paidAmount ?? 0;
  return paid <= 0 ? 'PENDING' : paid >= c.approvedAmount ? 'PAID' : 'PARTIAL';
}

/** Share of premium collected that goes back out as paid claims. */
export const claimsRatio = (premium: number, paid: number) => (premium > 0 ? Math.round((paid / premium) * 100) : 0);
