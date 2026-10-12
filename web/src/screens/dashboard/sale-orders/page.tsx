'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { saleOrdersApi, warehousesApi, buyersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';
import ErrorBanner from '@/components/ErrorBanner';
import OrderDetail, { StatusChip, STATUS_LABEL } from './OrderDetail';

interface Row {
  id: string; reference: string; status: string; quantityKg: number; pricePerKg: number;
  buyer: { name: string }; warehouse: { name: string }; createdByName?: string | null; createdAt: string;
  sale?: { paymentReceived: boolean } | null;
}
interface Option { id: string; name: string }
interface Lot { id: string; lotNumber: string; totalWeightKg: number; remainingKg: number; riceVariety?: string | null }
interface Warehouse extends Option { isActive: boolean; balance: { availableKg: number } }

const EMPTY = { buyerId: '', warehouseId: '', lotId: '', bags: '', bagSizeKg: '50', quantityKg: '', pricePerKg: '', packaging: '', needsTransport: false, notes: '' };

export default function SaleOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, 'sale_orders', 'CREATE');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [buyers, setBuyers] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [issued, setIssued] = useState<string | null>(null);

  const fetchRows = useCallback(
    () => saleOrdersApi.list({ status: status || undefined, q: q.trim() || undefined })
      .then((r) => { setRows(r.data ?? []); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load sale orders')))
      .finally(() => setLoading(false)),
    [status, q],
  );
  useEffect(() => { const t = setTimeout(fetchRows, 250); return () => clearTimeout(t); }, [fetchRows]);

  const openCreate = async () => {
    setForm({ ...EMPTY }); setFormError(''); setCreating(true);
    try {
      const [b, w] = await Promise.all([buyersApi.list(), warehousesApi.list()]);
      setBuyers(b.data ?? []); setWarehouses((w.data ?? []).filter((x: Warehouse) => x.isActive));
    } catch (e) { setFormError(apiErrorMessage(e, 'Could not load buyers, warehouses and lots')); }
  };

  // Lots with rice left in the chosen warehouse (the server works out what is already promised).
  useEffect(() => {
    if (!form.warehouseId) return;
    let live = true;
    saleOrdersApi.lots(form.warehouseId)
      .then((r) => { if (live) setLots(r.data ?? []); })
      .catch((e) => { if (live) { setLots([]); setFormError(apiErrorMessage(e, 'Could not load the lots')); } });
    return () => { live = false; };
  }, [form.warehouseId]);
  const warehouseLots = form.warehouseId ? lots : [];
  const pickedLot = warehouseLots.find((l) => l.id === form.lotId);
  const wh = warehouses.find((w) => w.id === form.warehouseId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const res = await saleOrdersApi.reserve({
        buyerId: form.buyerId, warehouseId: form.warehouseId, lotId: form.lotId,
        quantityKg: Number(form.quantityKg), pricePerKg: Number(form.pricePerKg),
        packaging: form.packaging.trim() || undefined, needsTransport: form.needsTransport, notes: form.notes.trim() || undefined,
      });
      setCreating(false); setIssued(res.data.reference); fetchRows();
    } catch (err) { setFormError(apiErrorMessage(err, 'Could not reserve the stock')); }
    finally { setSaving(false); }
  };

  /** Rice is sold in bags: bags × bag size fills the total weight and the packaging note. */
  const setBags = (bags: string, size: string) =>
    setForm((f) => {
      const n = Number(bags);
      return {
        ...f, bags, bagSizeKg: size,
        ...(n > 0 ? { quantityKg: String(n * Number(size)), packaging: `${n} × ${size} kg bags` } : { packaging: '' }),
      };
    });

  const set = (k: keyof typeof EMPTY, v: string | boolean) => setForm((f) => ({ ...f, [k]: v, ...(k === 'warehouseId' ? { lotId: '' } : {}) }));

  return (
    <div className="ua-page">
      <div className="ua-head">
        <div>
          <h1 className="ua-title">Sale Orders</h1>
          <p className="ua-sub">Reserve rice for a buyer, give them the reference, and follow it through the warehouse to delivery.</p>
        </div>
        {canCreate && <button className="btn-primary" onClick={openCreate}>+ New sale order</button>}
      </div>
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="ua-toolbar">
        <input className="input-field" type="search" placeholder="Search reference (e.g. MAD-26-0042) or buyer…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="ua-panel">
        <div className="ua-scroll">
          <table className="data-table ua-table">
            <thead><tr><th>Reference</th><th>Buyer</th><th>Quantity</th><th>Warehouse</th><th>Status</th><th>Created by</th><th>Date</th><th /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}><TableSkeleton rows={6} avatar={false} /></td></tr>
                : rows.length === 0 ? <tr><td colSpan={8} className="ua-empty"><strong>No sale orders yet</strong>{canCreate ? 'Create one to reserve stock for a buyer.' : 'Nothing to show.'}</td></tr>
                : rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.reference}</td>
                    <td>{r.buyer.name}</td>
                    <td>{r.quantityKg.toLocaleString()} kg</td>
                    <td>{r.warehouse.name}</td>
                    <td><StatusChip status={r.status} /></td>
                    <td className="ua-muted">{r.createdByName ?? '—'}</td>
                    <td className="ua-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn-secondary ua-action" onClick={() => setOpenId(r.id)}>Open</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {openId && (
        <Modal title="Sale order" onClose={() => setOpenId(null)} width="720px" footer={<button className="btn-secondary" onClick={() => setOpenId(null)}>Close</button>}>
          <OrderDetail orderId={openId} onChanged={fetchRows} />
        </Modal>
      )}

      {issued && (
        <Modal title="Stock reserved" subtitle="Give this reference to the buyer. They show it to the warehouse keeper." onClose={() => setIssued(null)}
          footer={<button className="btn-primary" onClick={() => setIssued(null)}>Done</button>}>
          <div className="so-issued">{issued}</div>
          <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(issued).catch(() => undefined)}>Copy reference</button>
        </Modal>
      )}

      {creating && (
        <Modal title="New sale order" subtitle="Stock is held for the buyer until the order is released or cancelled." width="560px" onClose={() => setCreating(false)}
          footer={<>
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)} disabled={saving}>Cancel</button>
            <button type="submit" form="so-form" className="btn-primary" disabled={saving}>{saving ? 'Reserving…' : 'Reserve stock'}</button>
          </>}>
          <form id="so-form" className="ua-form" onSubmit={submit} autoComplete="off">
            <div className="ua-field">
              <label className="ua-label" htmlFor="so-buyer">Buyer</label>
              <select id="so-buyer" className="input-field" required value={form.buyerId} onChange={(e) => set('buyerId', e.target.value)}>
                <option value="">Select a buyer…</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {buyers.length === 0 && <span className="ua-hint">No buyers yet. Add one on the Buyers page first.</span>}
            </div>
            <div className="ua-field">
              <label className="ua-label" htmlFor="so-wh">Warehouse</label>
              <select id="so-wh" className="input-field" required value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.balance.availableKg.toLocaleString()} kg available</option>)}
              </select>
            </div>
            <div className="ua-field">
              <label className="ua-label" htmlFor="so-lot">Lot</label>
              <select id="so-lot" className="input-field" required value={form.lotId} onChange={(e) => set('lotId', e.target.value)} disabled={!form.warehouseId}>
                <option value="">{form.warehouseId ? 'Select a lot…' : 'Choose a warehouse first'}</option>
                {warehouseLots.map((l) => <option key={l.id} value={l.id}>{l.lotNumber} — {l.remainingKg.toLocaleString()} kg left</option>)}
              </select>
              {form.warehouseId && warehouseLots.length === 0 && <span className="ua-hint">No lot has rice left to sell in this warehouse. Receive harvest and make a lot, or make a lot from counted stock on the Warehouse page.</span>}
            </div>
            <div className="so-bagrow">
              <div className="ua-field">
                <label className="ua-label" htmlFor="so-bags">Bags<span className="ua-opt">optional</span></label>
                <input id="so-bags" className="input-field" type="number" min={1} placeholder="e.g. 8" value={form.bags} onChange={(e) => setBags(e.target.value, form.bagSizeKg)} />
              </div>
              <div className="ua-field">
                <label className="ua-label" htmlFor="so-bagsize">Bag size</label>
                <select id="so-bagsize" className="input-field" value={form.bagSizeKg} onChange={(e) => setBags(form.bags, e.target.value)}>
                  <option value="50">50 kg bags</option>
                  <option value="100">100 kg bags</option>
                  <option value="25">25 kg bags</option>
                </select>
              </div>
            </div>
            <div className="ua-row">
              <div className="ua-field">
                <label className="ua-label" htmlFor="so-qty">Total weight (kg)</label>
                <input id="so-qty" className="input-field" type="number" min={1} step="any" required value={form.quantityKg} onChange={(e) => set('quantityKg', e.target.value)} />
                {pickedLot ? <span className="ua-hint">Up to {Math.min(pickedLot.remainingKg, wh?.balance.availableKg ?? pickedLot.remainingKg).toLocaleString()} kg can be sold from this lot</span> : wh && <span className="ua-hint">Pick a lot to see how much can be sold</span>}
              </div>
              <div className="ua-field">
                <label className="ua-label" htmlFor="so-price">Price per kg (TZS)</label>
                <input id="so-price" className="input-field" type="number" min={0} step="any" required value={form.pricePerKg} onChange={(e) => set('pricePerKg', e.target.value)} />
              </div>
            </div>
            {form.quantityKg && form.pricePerKg && <div className="ua-role-note">Order value: TZS {Math.round(Number(form.quantityKg) * Number(form.pricePerKg)).toLocaleString()}</div>}
            <label className="so-check"><input type="checkbox" checked={form.needsTransport} onChange={(e) => set('needsTransport', e.target.checked)} /> The buyer has no transport — the warehouse arranges it</label>
            <div className="ua-field">
              <label className="ua-label" htmlFor="so-notes">Notes<span className="ua-opt">optional</span></label>
              <input id="so-notes" className="input-field" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
            {formError && <div className="ua-form-error" role="alert">{formError}</div>}
          </form>
        </Modal>
      )}
    </div>
  );
}
