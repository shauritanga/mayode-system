'use client';
import { useEffect, useMemo, useState } from 'react';
import { marketApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { downloadCsv } from '@/lib/download';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { day, kg, tzs } from './format';

interface Row {
  id: string; invoiceNumber: string; saleDate: string; buyer: string; variety: string | null; quantityKg: number;
  pricePerKg: number; totalRevenue: number; paymentReceived: boolean; paymentDate: string | null;
  agreement: string | null; reservation: string | null; deliveryStatus: string | null;
}
interface Data { summary: { count: number; quantityKg: number; value: number; paid: number; outstanding: number }; rows: Row[] }

export default function DeliveriesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    marketApi.deliveries({ from: from || undefined, to: to || undefined })
      .then((r) => { setData(r.data as Data); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load deliveries.')));
  }, [from, to]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) =>
      (!status || (status === 'paid' ? r.paymentReceived : !r.paymentReceived)) &&
      (!q || r.buyer.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q) || (r.agreement ?? '').toLowerCase().includes(q)));
  }, [data, status, search]);

  if (error) return <div className="alert-box alert-danger">{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;
  const s = data.summary;

  return (
    <div>
      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Deliveries" value={s.count} tone="blue" />
        <MetricTile label="Rice delivered" value={kg(s.quantityKg)} tone="green" />
        <MetricTile label="Value" value={tzs(s.value)} tone="green" />
        <MetricTile label="Paid" value={tzs(s.paid)} tone="green" />
        <MetricTile label="Awaiting payment" value={tzs(s.outstanding)} tone={s.outstanding ? 'gold' : 'green'} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input className="input-field" type="search" placeholder="Search buyer, invoice, agreement…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <label className="form-label">From<input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="form-label">To<input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 170 }} aria-label="Payment status">
          <option value="">All payments</option><option value="paid">Paid</option><option value="unpaid">Awaiting payment</option>
        </select>
        <button className="btn-secondary" disabled={!rows.length} onClick={() => downloadCsv('rice-deliveries.csv', rows.map((r) => ({
          Invoice: r.invoiceNumber, Date: day(r.saleDate), Buyer: r.buyer, Variety: r.variety ?? '', Kg: r.quantityKg, PricePerKg: r.pricePerKg,
          Total: r.totalRevenue, Paid: r.paymentReceived ? 'Yes' : 'No', Agreement: r.agreement ?? '', Reservation: r.reservation ?? '' })))}>Export CSV</button>
      </div>
      <div className="table-panel">
        {rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No deliveries match.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Buyer</th><th>Variety</th><th>Quantity</th><th>Price/kg</th><th>Total</th><th>Agreement</th><th>Delivery</th><th>Payment</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.invoiceNumber}</td><td>{day(r.saleDate)}</td><td>{r.buyer}</td><td>{r.variety ?? '—'}</td>
                    <td>{kg(r.quantityKg)}</td><td>{tzs(r.pricePerKg)}</td><td style={{ fontWeight: 600 }}>{tzs(r.totalRevenue)}</td>
                    <td>{r.agreement ?? '—'}</td>
                    <td>{r.deliveryStatus ? <span className="badge badge-gray">{r.deliveryStatus.replace(/_/g, ' ')}</span> : '—'}</td>
                    <td>{r.paymentReceived ? <span className="badge badge-green">Paid {day(r.paymentDate)}</span> : <span className="badge badge-gold">Awaiting</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
