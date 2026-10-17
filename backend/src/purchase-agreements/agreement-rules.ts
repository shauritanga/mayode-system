import { AgreementStatus } from '@prisma/client';

const NEXT: Record<AgreementStatus, AgreementStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
};

export const canMove = (from: AgreementStatus, to: AgreementStatus) => NEXT[from].includes(to);

/** An active agreement past its end date is shown as expired. */
export const isExpired = (status: AgreementStatus, endDate: Date, now = new Date()) =>
  status === 'ACTIVE' && endDate.getTime() < now.getTime();

/** PA-2026-0007 style reference: the next number after the highest one issued this year. */
export function nextReference(year: number, lastReference?: string | null): string {
  const last = lastReference ? parseInt(lastReference.split('-')[2] ?? '0', 10) : 0;
  return `PA-${year}-${String((Number.isFinite(last) ? last : 0) + 1).padStart(4, '0')}`;
}
