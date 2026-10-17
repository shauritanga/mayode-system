'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { apiErrorMessage } from '@/lib/api-error';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { buyerOrdersApi, buyersApi } from '@/lib/api';
import { PAYMENT_BADGE, ProgressBar, day, kg, tzs } from '../market/format';

interface Buyer { id: string; name: string; isCertified: boolean; deliveryLocation?: string | null; preferredVarieties?: string[] }
interface BuyerOrder {
  id: string;
  riceVariety?: string;
  quantityRequiredKg: number;
  qualityRequirements?: string;
  status: string;
  requiredByDate?: string;
  notes?: string;
  offeredPricePerKg?: number | null;
  deliveryLocation?: string | null;
  qualityGrade?: string | null;
  progress?: { deliveredKg: number; deliveredValue: number; paidValue: number; outstandingValue: number; progressPct: number; paymentStatus: string };
  createdAt: string;
  buyer?: { name: string; isCertified?: boolean };
  sales?: { id: string; invoiceNumber: string; quantityKg: number }[];
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = { OPEN: 'badge-blue', PARTIALLY_FULFILLED: 'badge-gold', FULFILLED: 'badge-green', CANCELLED: 'badge-gray' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status.replace(/_/g, ' ')}</span>;
};

const EMPTY_FORM = { buyerId: '', riceVariety: '', quantityRequiredKg: '', qualityRequirements: '', qualityGrade: '', offeredPricePerKg: '', deliveryLocation: '', requiredByDate: '', notes: '' };

export default function BuyerOrdersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([buyerOrdersApi.getAll(), buyersApi.list()])
      .then(([ordersRes, buyersRes]) => {
        setOrders(ordersRes.data || []);
        setBuyers(buyersRes.data || []);
      })
      .catch((e) => setMessage(`Unable to load buyer orders: ${apiErrorMessage(e, 'request failed')}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await buyerOrdersApi.create({
        buyerId: form.buyerId,
        riceVariety: form.riceVariety || undefined,
        quantityRequiredKg: Number(form.quantityRequiredKg),
        qualityRequirements: form.qualityRequirements || undefined,
        qualityGrade: form.qualityGrade || undefined,
        offeredPricePerKg: form.offeredPricePerKg ? Number(form.offeredPricePerKg) : undefined,
        deliveryLocation: form.deliveryLocation || undefined,
        requiredByDate: form.requiredByDate ? new Date(form.requiredByDate).toISOString() : undefined,
        notes: form.notes || undefined,
      });
      setForm(EMPTY_FORM);
      setMessage('Buyer order created.');
      load();
    } catch (err) {
      setMessage(`Unable to create buyer order: ${apiErrorMessage(err, 'request failed')}`);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (order: BuyerOrder, status: string) => {
    try {
      await buyerOrdersApi.updateStatus(order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    } catch (err) {
      setMessage(`Unable to update order status: ${apiErrorMessage(err, 'request failed')}`);
    }
  };

  return (
    <div className="page-shell">
      {!embedded && (
        <div className="page-heading">
          <div>
            <div className="page-kicker">Market and Buyer Management</div>
            <h1 className="page-title">Buyer Orders</h1>
            <p className="page-subtitle">Rice requirements per buyer: quantity, variety, quality, offered price and delivery location.</p>
          </div>
        </div>
      )}

      <form onSubmit={create} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">New buyer order</h2>
            <p className="panel-copy">Records a buyer's requirement as a first-class agreement, separate from ad hoc sales.</p>
          </div>
        </div>
        {message && <div className={`alert-box ${message.includes('Unable') ? 'alert-danger' : 'alert-success'}`}>{message}</div>}
        <div className="form-grid-wide">
          <label className="form-label">Buyer<select className="input-field" required value={form.buyerId} onChange={(e) => { const b = buyers.find((x) => x.id === e.target.value); setForm((c) => ({ ...c, buyerId: e.target.value, deliveryLocation: c.deliveryLocation || b?.deliveryLocation || '', riceVariety: c.riceVariety || b?.preferredVarieties?.[0] || '' })); }}>
            <option value="">Select buyer</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isCertified ? ' (Fairtrade certified)' : ''}</option>)}
          </select></label>
          <label className="form-label">Preferred variety<input className="input-field" value={form.riceVariety} onChange={(e) => setForm((c) => ({ ...c, riceVariety: e.target.value }))} /></label>
          <label className="form-label">Quantity required (kg)<input className="input-field" required type="number" min="0.01" step="0.01" value={form.quantityRequiredKg} onChange={(e) => setForm((c) => ({ ...c, quantityRequiredKg: e.target.value }))} /></label>
          <label className="form-label">Offered price (TZS per kg)<input className="input-field" type="number" min="0" value={form.offeredPricePerKg} onChange={(e) => setForm((c) => ({ ...c, offeredPricePerKg: e.target.value }))} /></label>
          <label className="form-label">Quality grade<input className="input-field" placeholder="e.g. A" value={form.qualityGrade} onChange={(e) => setForm((c) => ({ ...c, qualityGrade: e.target.value }))} /></label>
          <label className="form-label">Delivery location<input className="input-field" value={form.deliveryLocation} onChange={(e) => setForm((c) => ({ ...c, deliveryLocation: e.target.value }))} /></label>
          <label className="form-label">Required by<input className="input-field" type="date" value={form.requiredByDate} onChange={(e) => setForm((c) => ({ ...c, requiredByDate: e.target.value }))} /></label>
          <label className="form-label form-grid-wide">Quality requirements<input className="input-field" placeholder="Grade 1, moisture <= 14%" value={form.qualityRequirements} onChange={(e) => setForm((c) => ({ ...c, qualityRequirements: e.target.value }))} /></label>
          <label className="form-label form-grid-wide">Notes<input className="input-field" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></label>
        </div>
        <button className="btn-primary" disabled={saving || !form.buyerId} style={{ marginTop: 12 }}>{saving ? 'Saving...' : 'Create order'}</button>
      </form>

      <div className="table-panel">
        <div className="section-toolbar"><strong>Buyer Orders</strong><span className="muted">{orders.length} shown</span></div>
        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : orders.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No buyer orders yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Variety</th>
                  <th>Quantity required</th>
                  <th>Offered price</th>
                  <th>Quality</th>
                  <th>Delivery location</th>
                  <th>Required by</th>
                  <th>Delivered</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const pr = order.progress;
                  const [payCls, payLabel] = PAYMENT_BADGE[pr?.paymentStatus ?? 'NO_DELIVERIES'];
                  return (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.buyer?.name || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{order.riceVariety || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{order.quantityRequiredKg.toLocaleString()} kg</td>
                      <td>{order.offeredPricePerKg ? tzs(order.offeredPricePerKg) : '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{[order.qualityGrade && `Grade ${order.qualityGrade}`, order.qualityRequirements].filter(Boolean).join(' · ') || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{order.deliveryLocation || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{day(order.requiredByDate)}</td>
                      <td><ProgressBar pct={pr?.progressPct ?? 0} /><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{kg(pr?.deliveredKg ?? 0)} · {order.sales?.length || 0} sale{order.sales?.length === 1 ? '' : 's'}</div></td>
                      <td><span className={`badge ${payCls}`}>{payLabel}</span>{pr && pr.outstandingValue > 0 && <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{tzs(pr.outstandingValue)} due</div>}</td>
                      <td>
                        <select className="input-field" style={{ fontSize: '12px', padding: '4px 8px' }} value={order.status} onChange={(e) => changeStatus(order, e.target.value)}>
                          <option value="OPEN">Open</option>
                          <option value="PARTIALLY_FULFILLED">Partially fulfilled</option>
                          <option value="FULFILLED">Fulfilled</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </td>
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
