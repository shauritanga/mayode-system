export const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${Math.round(n).toLocaleString()}`);
export const day = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const PURPOSES: [string, string][] = [
  ['SEED_AND_INPUTS', 'Seed and inputs'], ['LAND_PREPARATION', 'Land preparation'], ['LABOUR', 'Labour'],
  ['EQUIPMENT', 'Equipment'], ['IRRIGATION', 'Irrigation'], ['HARVEST_AND_TRANSPORT', 'Harvest and transport'],
  ['WORKING_CAPITAL', 'Working capital'], ['OTHER', 'Other'],
];
export const purposeLabel = (v?: string | null) => PURPOSES.find(([k]) => k === v)?.[1] ?? '—';

export const STATUS: Record<string, [string, string]> = {
  SUBMITTED: ['badge-blue', 'Submitted'],
  UNDER_REVIEW: ['badge-gold', 'Under review'],
  APPROVED: ['badge-green', 'Approved'],
  REJECTED: ['badge-red', 'Rejected'],
  DISBURSED: ['badge-green', 'Disbursed'],
  WITHDRAWN: ['badge-gray', 'Withdrawn'],
};

export const INSTALMENT: Record<string, [string, string]> = {
  PAID: ['badge-green', 'Paid'], PARTIAL: ['badge-blue', 'Part paid'], OVERDUE: ['badge-red', 'Overdue'], UPCOMING: ['badge-gray', 'Upcoming'],
};

export interface Application {
  id: string; reference: string; status: string; farmerId: string; farmerName: string; lenderId: string;
  amountRequested: number; approvedAmount: number | null; termMonths: number; purpose: string; purposeNote: string | null;
  creditScore: number | null; submittedOnBehalf: boolean; decisionNote: string | null; decidedAt: string | null;
  disbursedAmount: number | null; disbursedAt: string | null; disbursementRef: string | null; createdAt: string;
  autoDeductPercent: number | null;
  farmer: { id: string; controlNumber: string; village: string | null; district: string | null };
  lender: { id: string; name: string; interestRatePercent: number | null };
  terms: { amount: number; ratePercent: number; totalRepayable: number; instalment: number; indicative: boolean };
  loan?: { id: string; originalAmount: number; amountOwed: number; isActive: boolean } | null;
  schedule?: {
    rows: { number: number; dueDate: string; amount: number; paidAmount: number; balance: number; status: string }[];
    overdueCount: number; overdueAmount: number;
  } | null;
}
