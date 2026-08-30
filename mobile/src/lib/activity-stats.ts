export type ActivitySlice = 'completed' | 'pending' | 'overdue';

export interface ActivityStats {
  completed: number;
  pending: number;
  overdue: number;
}

export interface FarmPerfBar {
  label: string;
  pct: number;
}

function taskDue(entry: any): Date | null {
  const raw = entry?.date ?? entry?.dueDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifyRiceTask(entry: any, now: Date): ActivitySlice {
  if (entry?.status === 'COMPLETED') return 'completed';
  const due = taskDue(entry);
  if (due && due.getTime() < now.getTime()) return 'overdue';
  return 'pending';
}

export function summarizeRiceTasks(entries: any[], now = new Date()): {
  stats: ActivityStats;
  farmPerf: FarmPerfBar[];
} {
  const rice = (Array.isArray(entries) ? entries : []).filter((e) => e?.type === 'RICE_TASK');
  const stats: ActivityStats = { completed: 0, pending: 0, overdue: 0 };
  const byFarm = new Map<string, { completed: number; total: number }>();

  for (const entry of rice) {
    const slice = classifyRiceTask(entry, now);
    stats[slice] += 1;
    const label = entry.farm?.farmCode || entry.farm?.name || '—';
    const row = byFarm.get(label) ?? { completed: 0, total: 0 };
    row.total += 1;
    if (slice === 'completed') row.completed += 1;
    byFarm.set(label, row);
  }

  const farmPerf = [...byFarm.entries()]
    .map(([label, row]) => ({
      label: label.length > 8 ? label.slice(-8) : label,
      pct: row.total ? Math.round((row.completed / row.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  return { stats, farmPerf };
}

export function pendingTaskCount(entries: any[]): number {
  return (Array.isArray(entries) ? entries : []).filter(
    (e) => e?.type === 'RICE_TASK' && e.status !== 'COMPLETED',
  ).length;
}
