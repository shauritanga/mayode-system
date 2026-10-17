export const PRODUCTS: [string, string][] = [
  ['AREA_YIELD', 'Area-yield insurance'], ['WEATHER_INDEX', 'Weather-index insurance'], ['MULTI_PERIL', 'Multi-peril crop insurance'],
  ['INPUT_INSURANCE', 'Input insurance'], ['CREDIT_LINKED', 'Credit-linked crop insurance'],
];
export const productLabel = (v?: string | null) => PRODUCTS.find(([k]) => k === v)?.[1] ?? (v ?? '—').replace(/_/g, ' ');

export const APP_STATUS: Record<string, [string, string]> = {
  SUBMITTED: ['badge-blue', 'Submitted'],
  UNDER_REVIEW: ['badge-gold', 'Under review'],
  APPROVED: ['badge-green', 'Offer made'],
  REJECTED: ['badge-red', 'Rejected'],
  ACTIVATED: ['badge-green', 'Cover active'],
  WITHDRAWN: ['badge-gray', 'Withdrawn'],
};
export const RISK_BADGE: Record<string, string> = { LOW: 'badge-green', MEDIUM: 'badge-gold', HIGH: 'badge-red' };
export const CLAIM_PAY: Record<string, [string, string]> = {
  NOT_DUE: ['badge-gray', 'Not due'], PENDING: ['badge-gold', 'Payment pending'], PARTIAL: ['badge-blue', 'Part paid'], PAID: ['badge-green', 'Paid'],
};

export interface RiskInfo {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  factors: { label: string; points: number; detail: string }[];
  alertsInArea: number;
  area: string | null;
}
export interface InsApplication {
  id: string; reference: string; status: string; farmerId: string; farmerName: string; providerId: string;
  productType: string; riceVariety: string | null; insuredAreaHectares: number; requestedSumInsured: number | null; notes: string | null;
  riskLevel: string; riskSnapshot: RiskInfo; submittedOnBehalf: boolean; createdAt: string;
  sumInsured: number | null; premiumAmount: number | null; startDate: string | null; endDate: string | null; decisionNote: string | null;
  premiumPaidAmount: number | null; premiumPaidAt: string | null; premiumReference: string | null; policyId: string | null;
  farmer: { controlNumber: string; village: string | null; district: string | null };
  provider: { id: string; name: string };
  farm?: { farmCode: string; name: string; socialHectares: number } | null;
}
