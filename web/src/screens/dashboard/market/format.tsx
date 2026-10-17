import type { ReactElement } from 'react';
export const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${Math.round(n).toLocaleString()}`);
export const kg = (n?: number | null) => (n == null ? '—' : `${(Math.round(n * 10) / 10).toLocaleString()} kg`);
export const day = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const PAYMENT_BADGE: Record<string, [string, string]> = {
  NO_DELIVERIES: ['badge-gray', 'No deliveries'],
  UNPAID: ['badge-gold', 'Unpaid'],
  PARTIAL: ['badge-blue', 'Part paid'],
  PAID: ['badge-green', 'Paid'],
};

export const BUSINESS_TYPES: [string, string][] = [
  ['MILLER', 'Miller'], ['TRADER', 'Trader'], ['EXPORTER', 'Exporter'], ['PROCESSOR', 'Processor'],
  ['RETAILER', 'Retailer'], ['WHOLESALER', 'Wholesaler'], ['INSTITUTION', 'Institution'], ['NGO', 'NGO / programme'], ['OTHER', 'Other'],
];
export const businessTypeLabel = (v?: string | null) => BUSINESS_TYPES.find(([k]) => k === v)?.[1] ?? '—';

export function ProgressBar({ pct }: { pct: number }): ReactElement {
  return (
    <div style={{ minWidth: 90 }} title={`${pct}% delivered`}>
      <div style={{ height: 6, borderRadius: 9999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green-500)' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginTop: 2 }}>{pct}%</div>
    </div>
  );
}
