/**
 * How a rice-calendar activity is described to farmers, staff and insurance reviewers.
 *
 * Days are Tanzanian calendar days (East Africa Time, UTC+3): an activity due on the 5th is on time
 * if it was done any time on the 5th, whatever hour the server clock says.
 */
const EAT_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Whole days since 1970 in East Africa Time. */
export const eatDay = (d: Date) =>
  Math.floor((d.getTime() + EAT_OFFSET_MS) / DAY_MS);

export type TaskView =
  /** Done on or before its due day. */
  | 'ON_TIME'
  /** Done after its due day (it may have been marked missed first). */
  | 'LATE'
  /** Not done, and past the grace period: shown red, farmer notified. */
  | 'MISSED'
  /** Past its due day but still inside the grace period. */
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'UPCOMING';

export interface TaskLike {
  status: string;
  dueDate: Date;
  completedAt?: Date | null;
  missedAt?: Date | null;
}

export function taskView(
  task: TaskLike,
  now = new Date(),
  dueSoonDays = 1,
): TaskView {
  if (task.status === 'COMPLETED') {
    const late = task.completedAt
      ? eatDay(task.completedAt) > eatDay(task.dueDate)
      : false;
    return late || task.missedAt ? 'LATE' : 'ON_TIME';
  }
  if (task.status === 'MISSED') return 'MISSED';
  if (task.status === 'SKIPPED') return 'UPCOMING';
  const ahead = eatDay(task.dueDate) - eatDay(now);
  if (ahead < 0) return 'OVERDUE';
  return ahead <= dueSoonDays ? 'DUE_SOON' : 'UPCOMING';
}

/** Whole days late, or 0 when done on time (or not done). */
export function lateByDays(task: TaskLike): number {
  if (task.status !== 'COMPLETED' || !task.completedAt) return 0;
  return Math.max(0, eatDay(task.completedAt) - eatDay(task.dueDate));
}

/** True when a pending task has been past its due day for at least `graceDays` days. */
export function isMissed(
  task: TaskLike,
  now: Date,
  graceDays: number,
): boolean {
  return (
    task.status === 'PENDING' &&
    eatDay(now) - eatDay(task.dueDate) >= Math.max(graceDays, 1)
  );
}

/** True when a pending task is due within `leadDays` days (today counts) and not yet past due. */
export function isDueForReminder(
  task: TaskLike,
  now: Date,
  leadDays: number,
): boolean {
  if (task.status !== 'PENDING') return false;
  const ahead = eatDay(task.dueDate) - eatDay(now);
  return ahead >= 0 && ahead <= Math.max(leadDays, 0);
}

/** A completion date reported by the phone more than this long before the server received it is flagged. */
export const BACKDATE_FLAG_DAYS = 7;

export function isBackdated(task: {
  completedAt?: Date | null;
  recordedAt?: Date | null;
}): boolean {
  if (!task.completedAt || !task.recordedAt) return false;
  return (
    eatDay(task.recordedAt) - eatDay(task.completedAt) > BACKDATE_FLAG_DAYS
  );
}
