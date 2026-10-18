export const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${(Math.round(n * 100) / 100).toLocaleString()}`);
export const kg = (n?: number | null) => (n == null ? '—' : `${(Math.round(n * 1000) / 1000).toLocaleString()} kg`);
export const day = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (v?: string | Date | null) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const label = (v?: string | null) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

const TONES: Record<string, string> = {
  // order
  PENDING_ACCOUNTS_REVIEW: 'badge-gold', RETURNED_TO_SALES: 'badge-red', APPROVED_FOR_INVOICING: 'badge-blue', INVOICED: 'badge-blue', COMPLETED: 'badge-green', CANCELLED: 'badge-gray',
  // payment / invoice
  UNPAID: 'badge-gold', PARTIALLY_PAID: 'badge-blue', PAID: 'badge-green', ISSUED: 'badge-blue', VOID: 'badge-gray', PENDING: 'badge-gold', CONFIRMED: 'badge-green', REJECTED: 'badge-red',
  // fulfilment
  NOT_AUTHORIZED: 'badge-gray', AUTHORIZED: 'badge-blue', SHORTAGE: 'badge-red', ALLOCATED: 'badge-blue', PARTIALLY_DISPATCHED: 'badge-gold', DISPATCHED: 'badge-green',
  // receipts / dispatch / quotation
  DRAFT: 'badge-gray', SENT: 'badge-blue', ACCEPTED: 'badge-green', CONVERTED: 'badge-green', PREPARED: 'badge-gold', RELEASED: 'badge-green',
  // tasks
  ASSIGNED: 'badge-blue', ACKNOWLEDGED: 'badge-blue', IN_PROGRESS: 'badge-gold', PENDING_REVIEW: 'badge-gold', RETURNED: 'badge-red',
  // processing / misc
  REVERSED: 'badge-gray', DELIVERED: 'badge-green', EXCEPTION: 'badge-red', NOT_DELIVERED: 'badge-gray', URGENT: 'badge-red', HIGH: 'badge-gold', NORMAL: 'badge-gray', LOW: 'badge-gray',
};
export const tone = (status?: string | null) => TONES[status ?? ''] ?? 'badge-gray';

export function downloadBlob(data: BlobPart, filename: string, type?: string) {
  const url = URL.createObjectURL(new Blob([data], type ? { type } : undefined));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function openBlob(data: BlobPart, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
