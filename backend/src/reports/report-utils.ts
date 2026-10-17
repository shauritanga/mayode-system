export const ACRE_TO_HA = 0.404686;
const YOUTH_MAX_AGE = 35;

export const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Whole-number percentage; 0 when the denominator is empty. */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export const iso = (date?: Date | null) => (date ? date.toISOString().slice(0, 10) : '');

export function ageYears(dateOfBirth?: Date | null, now = new Date()): number | null {
  if (!dateOfBirth) return null;
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const birthday = new Date(now.getFullYear(), dateOfBirth.getMonth(), dateOfBirth.getDate());
  if (now < birthday) age -= 1;
  return age;
}

export const isYouth = (dateOfBirth?: Date | null, now = new Date()) => {
  const age = ageYears(dateOfBirth, now);
  return age !== null && age <= YOUTH_MAX_AGE;
};

export function ageingBucket(days: number): string {
  if (days <= 90) return '0–90 days';
  if (days <= 180) return '91–180 days';
  if (days <= 365) return '181–365 days';
  return 'Over 1 year';
}
