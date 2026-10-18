/** Pure business rules for Mayode operations. Nothing here touches the database. */

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------- money ----------

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRatePercent?: number;
}

/** Discount comes off the gross, then tax is charged on what is left. */
export function lineTotals(l: LineInput) {
  const gross = r2(l.quantity * l.unitPrice);
  const discount = r2(gross * ((l.discountPercent ?? 0) / 100));
  const net = r2(gross - discount);
  const tax = r2(net * ((l.taxRatePercent ?? 0) / 100));
  return { gross, discount, net, tax, total: r2(net + tax) };
}

export function documentTotals(lines: LineInput[]) {
  const t = lines.map(lineTotals);
  const sum = (k: 'gross' | 'discount' | 'net' | 'tax' | 'total') => r2(t.reduce((s, x) => s + x[k], 0));
  return { subtotal: sum('gross'), discountTotal: sum('discount'), taxTotal: sum('tax'), total: sum('total') };
}

export type PayStateName = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
/** Paid means the confirmed money covers the total (to the cent). */
export function paymentState(total: number, paid: number): PayStateName {
  if (paid <= 0) return 'UNPAID';
  return r2(paid) >= r2(total) ? 'PAID' : 'PARTIALLY_PAID';
}

// ---------- order workflow ----------

const ORDER_NEXT: Record<string, string[]> = {
  PENDING_ACCOUNTS_REVIEW: ['RETURNED_TO_SALES', 'APPROVED_FOR_INVOICING', 'CANCELLED'],
  RETURNED_TO_SALES: ['PENDING_ACCOUNTS_REVIEW', 'CANCELLED'],
  APPROVED_FOR_INVOICING: ['INVOICED', 'RETURNED_TO_SALES', 'CANCELLED'],
  INVOICED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
export const canMoveOrder = (from: string, to: string) => (ORDER_NEXT[from] ?? []).includes(to);

const TASK_NEXT: Record<string, string[]> = {
  ASSIGNED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_REVIEW', 'CANCELLED'],
  PENDING_REVIEW: ['COMPLETED', 'REJECTED', 'RETURNED', 'CANCELLED'],
  RETURNED: ['IN_PROGRESS', 'PENDING_REVIEW', 'CANCELLED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};
export const canMoveTask = (from: string, to: string) => (TASK_NEXT[from] ?? []).includes(to);

// ---------- stock ----------

export interface LedgerRow {
  type: string;
  quantityKg: number;
}

/** Physical stock is the sum of the signed ledger rows. */
export const physicalKg = (rows: LedgerRow[]) => r3(rows.reduce((t, r) => t + r.quantityKg, 0));

export interface Allocatable {
  batchId: string;
  createdAt: Date;
  availableKg: number;
}

/** First in, first out: take from the oldest batches until the quantity is covered. */
export function suggestAllocation(batches: Allocatable[], quantityKg: number) {
  const picks: { batchId: string; quantityKg: number }[] = [];
  let left = r3(quantityKg);
  for (const b of [...batches].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (left <= 0) break;
    const take = r3(Math.min(b.availableKg, left));
    if (take > 0) {
      picks.push({ batchId: b.batchId, quantityKg: take });
      left = r3(left - take);
    }
  }
  return { picks, shortageKg: Math.max(left, 0) };
}

// ---------- processing ----------

export interface RunOutputInput {
  kind: string;
  quantityKg: number;
}

/** Input and output of one run: what was lost, as kilograms and a share of the input. */
export function runBalance(inputKg: number, outputs: RunOutputInput[]) {
  const outputKg = r3(outputs.reduce((t, o) => t + o.quantityKg, 0));
  const lossKg = r3(inputKg - outputKg);
  const rice = outputs.filter((o) => o.kind === 'PRODUCT').reduce((t, o) => t + o.quantityKg, 0);
  return {
    outputKg,
    lossKg,
    lossPct: inputKg > 0 ? r2((lossKg / inputKg) * 100) : 0,
    /** Head rice per 100 kg of paddy. */
    milledYieldPct: inputKg > 0 ? r2((rice / inputKg) * 100) : 0,
  };
}

/** Outputs may never total more than went in: that would create rice from nothing. */
export const outputsExceedInput = (inputKg: number, outputs: RunOutputInput[]) =>
  r3(outputs.reduce((t, o) => t + o.quantityKg, 0)) > r3(inputKg);

// ---------- harvest reconciliation ----------

export function harvestPosition(h: { actualKg: number; transportedKg: number }, receipts: { grossKg: number; rejectedKg: number; status: string }[]) {
  const confirmed = receipts.filter((r) => r.status === 'CONFIRMED');
  const receivedKg = r3(confirmed.reduce((t, r) => t + r.grossKg, 0));
  const rejectedKg = r3(confirmed.reduce((t, r) => t + r.rejectedKg, 0));
  const acceptedKg = r3(receivedKg - rejectedKg);
  return {
    actualKg: h.actualKg,
    transportedKg: h.transportedKg,
    receivedKg,
    acceptedKg,
    rejectedKg,
    /** Left the field but never reached the warehouse receipt. */
    lostInTransitKg: r3(Math.max(h.transportedKg - receivedKg, 0)),
    notYetTransportedKg: r3(Math.max(h.actualKg - h.transportedKg, 0)),
  };
}

// ---------- GPS ----------

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Distance from the registered point. Poor GPS accuracy widens the allowance rather than failing a good visit. */
export function geofence(point: { lat: number; lon: number; accuracyM?: number | null }, ref: { lat: number; lon: number } | null, radiusM: number) {
  if (!ref) return { distanceM: null as number | null, within: null as boolean | null, note: 'No registered location to compare with' };
  const distanceM = haversineM(point.lat, point.lon, ref.lat, ref.lon);
  const allowance = radiusM + Math.min(point.accuracyM ?? 0, 100);
  const within = distanceM <= allowance;
  return { distanceM, within, note: within ? 'At the registered location' : `${distanceM} m from the registered location` };
}

// ---------- references ----------

export const padRef = (prefix: string, n: number, width = 4) => `${prefix}-${String(n).padStart(width, '0')}`;
export const yearPrefix = (prefix: string, date = new Date()) => `${prefix}-${date.getFullYear()}`;
