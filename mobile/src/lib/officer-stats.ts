export type FarmerVerificationStats = {
  verified: number;
  pending: number;
  other: number;
};

export type WeeklyVisitPoint = {
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

export function weeklyVisitTrend(visits: any[], weeks = 6, now = new Date()): WeeklyVisitPoint[] {
  const points: WeeklyVisitPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(23, 59, 59, 999);

    const count = visits.filter((visit) => {
      const raw = visit?.visitedAt ?? visit?.date;
      if (!raw) return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && d >= weekStart && d <= weekEnd;
    }).length;

    points.push({
      label: weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: count,
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
