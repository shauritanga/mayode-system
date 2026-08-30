import type { TrendRange } from './finance-trend';

export type FarmerVerificationStats = {
  verified: number;
  pending: number;
  other: number;
};

export type VisitTrendPoint = {
  label: string;
  value: number;
};

export type PurposeBar = {
  label: string;
  value: number;
};

const PURPOSE_SHORT: Record<string, string> = {
  ROUTINE_CHECK: 'Routine',
  FARMING_ASSISTANCE: 'Assist',
  VERIFICATION: 'Verify',
  DISPUTE_FOLLOWUP: 'Dispute',
  TRAINING: 'Train',
  OTHER: 'Other',
};

function unwrapList(res: any): any[] {
  const raw = res?.data?.data ?? res?.data;
  return Array.isArray(raw) ? raw : [];
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function countVisitsInRange(visits: any[], from: Date, to: Date) {
  let total = 0;
  for (const visit of visits) {
    const raw = visit?.visitedAt ?? visit?.date;
    if (!raw) continue;
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) continue;
    if (when >= from && when < to) total += 1;
  }
  return total;
}

export function breakdownFarmerStats(
  breakdown?: { verified?: number; pending?: number; other?: number } | null,
): FarmerVerificationStats {
  return {
    verified: breakdown?.verified ?? 0,
    pending: breakdown?.pending ?? 0,
    other: breakdown?.other ?? 0,
  };
}

export function summarizeFarmerVerification(farmers: any[]): FarmerVerificationStats {
  const stats: FarmerVerificationStats = { verified: 0, pending: 0, other: 0 };
  for (const farmer of farmers) {
    const status = farmer?.verificationStatus;
    if (status === 'VERIFIED') stats.verified += 1;
    else if (status === 'PENDING') stats.pending += 1;
    else stats.other += 1;
  }
  return stats;
}

export function buildVisitTrend(visits: any[], range: TrendRange, now = new Date()): VisitTrendPoint[] {
  const today = startOfDay(now);
  const points: VisitTrendPoint[] = [];

  if (range === 'weekly') {
    for (let i = 6; i >= 0; i -= 1) {
      const from = addDays(today, -i);
      const to = addDays(from, 1);
      points.push({
        value: countVisitsInRange(visits, from, to),
        label: from.toLocaleDateString(undefined, { weekday: 'short' }),
      });
    }
    return points;
  }

  if (range === 'monthly') {
    for (let i = 3; i >= 0; i -= 1) {
      const from = addDays(today, -(i + 1) * 7);
      const to = i === 0 ? addDays(today, 1) : addDays(today, -i * 7);
      points.push({
        value: countVisitsInRange(visits, from, to),
        label: `W${4 - i}`,
      });
    }
    return points;
  }

  for (let i = 11; i >= 0; i -= 1) {
    const from = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    points.push({
      value: countVisitsInRange(visits, from, to),
      label: from.toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return points;
}

export function visitsByPurpose(visits: any[]): PurposeBar[] {
  const counts = new Map<string, number>();
  for (const visit of visits) {
    const key = visit?.purpose || 'OTHER';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([purpose, value]) => ({
      label: PURPOSE_SHORT[purpose] ?? purpose.slice(0, 8),
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function normalizeVisits(res: any): any[] {
  return unwrapList(res);
}

export function normalizeFarmers(res: any): any[] {
  return unwrapList(res);
}
