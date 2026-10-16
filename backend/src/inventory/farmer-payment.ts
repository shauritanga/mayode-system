import { FarmerPaymentStatus } from '@prisma/client';

/** Value of a delivery at the purchase price, or null until a price is set. */
export const deliveryValue = (
  weightKg: number,
  pricePerKg?: number | null,
): number | null =>
  pricePerKg == null ? null : Math.round(weightKg * pricePerKg * 100) / 100;

/** UNPAID until something is paid, PAID once the value is covered, PARTIAL in between. */
export function paymentStatusFor(
  totalValue: number | null | undefined,
  amountPaid: number,
): FarmerPaymentStatus {
  if (amountPaid <= 0) return 'UNPAID';
  if (totalValue != null && amountPaid >= totalValue) return 'PAID';
  return 'PARTIAL';
}
