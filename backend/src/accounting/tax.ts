/** East Africa Time (Africa/Dar_es_Salaam) is UTC+3 all year; the books run on its calendar. */
const EAT_MS = 3 * 3_600_000;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** The calendar day (YYYY-MM-DD) an instant falls on in Tanzania. */
export const localDate = (d: Date) => new Date(d.getTime() + EAT_MS).toISOString().slice(0, 10);
/** Midday on the day after `closedThrough` (YYYY-MM-DD) — the first day anything can still be posted on. */
export function nextOpenInstant(closedThrough: string): Date {
  const next = new Date(`${closedThrough}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(`${next.toISOString().slice(0, 10)}T09:00:00.000Z`); // 12:00 EAT
}
export const isMonthEnd = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getUTCDate() === 1;
};

export type TaxInput = {
  /** The amount before VAT. */
  net: number;
  vatRegistered: boolean;
  /** Percent, e.g. 18. */
  vatRate: number;
  /** False for a zero-rated or exempt document. */
  vatApplies?: boolean;
  /** Percent of the net amount held back as withholding tax (0–100). */
  withholdingPercent?: number;
};
export type TaxResult = { subtotal: number; vatAmount: number; total: number; withholdingAmount: number; payable: number };

/** VAT is added only for a VAT-registered cooperative; withholding is a share of the net amount held back from the payment. */
export function computeTax(i: TaxInput): TaxResult {
  const subtotal = round2(i.net);
  const vatAmount = i.vatRegistered && i.vatApplies !== false ? round2((subtotal * i.vatRate) / 100) : 0;
  const total = round2(subtotal + vatAmount);
  const withholdingAmount = round2((subtotal * (i.withholdingPercent ?? 0)) / 100);
  return { subtotal, vatAmount, total, withholdingAmount, payable: round2(total - withholdingAmount) };
}
