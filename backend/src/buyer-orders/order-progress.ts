export interface OrderSaleLike {
  quantityKg: number;
  totalRevenue: number;
  paymentReceived: boolean;
}

export interface Progress {
  deliveredKg: number;
  deliveredValue: number;
  paidValue: number;
  outstandingValue: number;
  /** Share of the required quantity delivered, capped at 100. */
  progressPct: number;
  paymentStatus: 'NO_DELIVERIES' | 'UNPAID' | 'PARTIAL' | 'PAID';
}

/** Delivery and payment position of an order or agreement from the sales booked against it. */
export function progressOf(requiredKg: number, sales: OrderSaleLike[]): Progress {
  const deliveredKg = sales.reduce((t, s) => t + s.quantityKg, 0);
  const deliveredValue = sales.reduce((t, s) => t + s.totalRevenue, 0);
  const paidValue = sales.filter((s) => s.paymentReceived).reduce((t, s) => t + s.totalRevenue, 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    deliveredKg: round(deliveredKg),
    deliveredValue: round(deliveredValue),
    paidValue: round(paidValue),
    outstandingValue: round(deliveredValue - paidValue),
    progressPct: requiredKg > 0 ? Math.min(100, Math.round((deliveredKg / requiredKg) * 100)) : 0,
    paymentStatus: !sales.length
      ? 'NO_DELIVERIES'
      : paidValue <= 0
        ? 'UNPAID'
        : paidValue >= deliveredValue
          ? 'PAID'
          : 'PARTIAL',
  };
}
