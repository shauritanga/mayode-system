export const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${Math.round(n).toLocaleString()}`);
export const kgs = (n?: number | null) => (n == null ? '—' : `${Math.round(n * 10) / 10} kg`.replace(/\B(?=(\d{3})+(?!\d))/g, ','));

export const PAYMENT_LABELS: Record<string, string> = { UNPAID: 'Unpaid', PARTIAL: 'Part paid', PAID: 'Paid' };
export const PAYMENT_BADGE: Record<string, string> = { UNPAID: 'badge-gold', PARTIAL: 'badge-blue', PAID: 'badge-green' };

export interface DeliveryRow {
  id: string;
  trackingCode: string;
  weightKg: number;
  bags?: number | null;
  qualityGrade?: string | null;
  moistureContentPct?: number | null;
  riceVariety?: string | null;
  pricePerKg?: number | null;
  totalValue?: number | null;
  amountPaid: number;
  farmerPaymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  batchNumber?: string | null;
  warehouseLocation?: string | null;
  warehouse?: { id: string; name: string } | null;
  collectionCentre?: { id: string; name: string } | null;
  status: string;
  receivedDate: string;
  lotNumber?: string | null;
  farm?: { farmCode: string };
  farmer?: { id?: string; firstName: string; lastName: string; controlNumber?: string };
  lot?: {
    lotNumber: string;
    riceVariety?: string | null;
    sales?: { id: string; invoiceNumber: string; paymentReceived: boolean; buyer: { name: string } }[];
    saleOrders?: { id: string; reference: string; status: string; buyer: { name: string } }[];
  } | null;
}

/** Variety of a delivery: its own, else its lot's. */
export const deliveryVariety = (r: DeliveryRow) => r.riceVariety ?? r.lot?.riceVariety ?? null;

/** Buyers of the lot this delivery sits in (sale orders and invoiced sales). */
export function deliveryBuyers(r: DeliveryRow): string[] {
  const names = [...(r.lot?.sales ?? []).map((s) => s.buyer.name), ...(r.lot?.saleOrders ?? []).filter((o) => o.status !== 'CANCELLED').map((o) => o.buyer.name)];
  return [...new Set(names)];
}
