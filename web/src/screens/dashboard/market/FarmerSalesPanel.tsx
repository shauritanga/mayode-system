'use client';
import { useEffect, useMemo, useState } from 'react';
import { marketApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { downloadCsv } from '@/lib/download';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { day, kg, tzs } from './format';

interface Row {
  id: string; saleDate: string; invoiceNumber: string; buyer: string; variety: string | null; farmer: string; controlNumber: string;
  village: string | null; quantityKg: number; grossAmount: number; premium: number; netPayable: number | null; paymentStatus: string; paidAt: string | null;
}
interface Data { summary: { count: number; farmers: number; quantityKg: number; gross: number; paid: number; pending: number }; rows: Row[] }

const BADGE: Record<string, [string, string]> = {
  PAID: ['badge-green', 'Paid'], NOT_STARTED: ['badge-gray', 'Not started'], PENDING: ['badge-gold', 'Pending'],
  IN_ESCROW: ['badge-blue', 'In escrow'], FAILED: ['badge-red', 'Failed'], REFUNDED: ['badge-gray', 'Refunded'],
};

export default function FarmerSalesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    marketApi.farmerSales({ from: from || undefined, to: to || undefined })
      .then((r) => { setData(r.data as Data); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load farmer sales.')));
  }, [from, to]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => !q || r.farmer.toLowerCase().includes(q) || r.controlNumber.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q));
  }, [data, search]);

  if (error) return <div className="alert-box alert-danger">{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;
  const s = data.summary;

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginBottom: 12 }}>
        Each farmer’s share of a cooperative sale, worked out from the weight they delivered, with the status of their payout.
      </p>
      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Farmers paid for" value={s.farmers} tone="blue" />
        <MetricTile label="Rice sold on their behalf" value={kg(s.quantityKg)} tone="green" />
        <MetricTile label="Gross share" value={tzs(s.gross)} tone="green" />
        <MetricTile label="Paid out" value={tzs(s.paid)} tone="green" />
        <MetricTile label="Payouts not complete" value={s.pending} tone={s.pending ? 'gold' : 'green'} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input className="input-field" type="search" placeholder="Search farmer, control no., invoice…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <label className="form-label">From<input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="form-label">To<input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn-secondary" disabled={!rows.length} onClick={() => downloadCsv('farmer-sales.csv', rows.map((r) => ({
          Date: day(r.saleDate), Invoice: r.invoiceNumber, Buyer: r.buyer, Farmer: r.farmer, ControlNumber: r.controlNumber, Village: r.village ?? '',
          Kg: r.quantityKg, Gross: r.grossAmount, Premium: r.premium, NetPayable: r.netPayable ?? '', Payment: r.paymentStatus })))}>Export CSV</button>
      </div>
      <div className="table-panel">
        {rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No farmer sales yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Farmer</th><th>Village</th><th>Invoice</th><th>Buyer</th><th>Quantity</th><th>Gross share</th><th>Premium</th><th>Net payable</th><th>Payout</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [cls, label] = BADGE[r.paymentStatus] ?? ['badge-gray', r.paymentStatus];
                  return (
                    <tr key={r.id}>
                      <td>{day(r.saleDate)}</td>
                      <td style={{ fontWeight: 600 }}>{r.farmer}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.controlNumber}</div></td>
                      <td>{r.village ?? '—'}</td><td>{r.invoiceNumber}</td><td>{r.buyer}</td><td>{kg(r.quantityKg)}</td>
                      <td>{tzs(r.grossAmount)}</td><td>{tzs(r.premium)}</td><td>{tzs(r.netPayable)}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
