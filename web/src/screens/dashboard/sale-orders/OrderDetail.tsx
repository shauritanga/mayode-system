'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { saleOrdersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import ErrorBanner from '@/components/ErrorBanner';

export interface OrderEvent {
  id: string;
  type: string;
  actorName?: string | null;
  note?: string | null;
  data?: Record<string, unknown> | null;
  createdAt: string;
}

export interface OrderLoadRow {
  id: string;
  sequence: number;
  weightKg: number;
  bagCount?: number | null;
  vehiclePlate: string;
  driverName: string;
  driverPhone?: string | null;
  mode: 'BUYER_PICKUP' | 'OWN_FLEET' | 'HIRED';
  transporterName?: string | null;
  fee?: number | null;
  destination?: string | null;
  status: 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  loadedAt: string;
  deliveredAt?: string | null;
  receivedBy?: string | null;
  loadedByName?: string | null;
}

export type OrderStatus = 'RESERVED' | 'CONFIRMED' | 'PARTIALLY_RELEASED' | 'RELEASED' | 'COMPLETED' | 'CANCELLED';

export interface OrderDetailData {
  id: string;
  reference: string;
  status: OrderStatus;
  quantityKg: number;
  pricePerKg: number;
  amount: number;
  loadedKg: number;
  remainingKg: number;
  packaging?: string | null;
  expiresAt?: string | null;
  needsTransport: boolean;
  creditTermDays?: number | null;
  notes?: string | null;
  cancelReason?: string | null;
  createdByName?: string | null;
  createdAt: string;
  buyer: { name: string; contactPerson?: string | null; contactPhone?: string | null };
  warehouse: { name: string; location?: string | null };
  lot: { lotNumber: string };
  sale?: { invoiceNumber: string; paymentReceived: boolean } | null;
  loads: OrderLoadRow[];
  payment: { paid: boolean; creditApproved: boolean; releaseApproved: boolean; canRelease: boolean; creditApprovedByName?: string | null; releaseApprovedByName?: string | null };
  events: OrderEvent[];
}

export const STATUS_LABEL: Record<string, string> = {
  RESERVED: 'Reserved', CONFIRMED: 'Confirmed', PARTIALLY_RELEASED: 'Part loaded', RELEASED: 'Fully loaded', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

const EVENT_LABEL: Record<string, string> = {
  'order.reserved': 'Stock reserved and reference issued',
  'order.confirmed': 'Confirmed at the warehouse',
  'order.credit_approved': 'Credit term approved',
  'order.release_approved': 'Unpaid release approved',
  'order.truck_loaded': 'Truck loaded',
  'load.departed': 'Truck left with the goods',
  'load.delivered': 'Truck delivered',
  'order.cancelled': 'Order cancelled',
  'order.completed': 'Order completed',
  'order.closed_short': 'Closed short by a manager',
  'order.expired': 'Reservation expired and stock released',
};

const MODE_LABEL: Record<string, string> = { BUYER_PICKUP: 'Buyer’s own truck', OWN_FLEET: 'Our vehicle', HIRED: 'Hired transporter' };
const LOAD_LABEL: Record<string, string> = { ASSIGNED: 'Loaded', IN_TRANSIT: 'On the road', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

const money = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function StatusChip({ status }: { status: string }) {
  return <span className={`so-chip is-${status.toLowerCase()}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/** Opens a clean, printable gate pass for one truck: the driver shows it at the gate. */
function printGatePass(o: OrderDetailData, l: OrderLoadRow) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  const esc = (v: string | number | null | undefined) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gate pass ${esc(o.reference)}-${l.sequence}</title>
<style>body{font-family:Arial,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
td{border:1px solid #999;padding:10px;font-size:15px}td:first-child{width:34%;background:#f2f2f2;font-weight:bold}.big{font-size:28px;font-weight:bold;letter-spacing:1px}
.sign{margin-top:48px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:13px}</style></head><body>
<h1>GATE PASS</h1><div class="big">${esc(o.reference)} &middot; Load ${l.sequence}</div>
<table>
<tr><td>Buyer</td><td>${esc(o.buyer.name)}</td></tr>
<tr><td>Warehouse</td><td>${esc(o.warehouse.name)}</td></tr>
<tr><td>Lot</td><td>${esc(o.lot.lotNumber)}</td></tr>
<tr><td>Weight loaded</td><td>${esc(kg(l.weightKg))}${l.bagCount ? ` (${l.bagCount} bags)` : ''}</td></tr>
<tr><td>Vehicle</td><td>${esc(l.vehiclePlate)}</td></tr>
<tr><td>Driver</td><td>${esc(l.driverName)}${l.driverPhone ? ` &middot; ${esc(l.driverPhone)}` : ''}</td></tr>
<tr><td>Transport</td><td>${esc(MODE_LABEL[l.mode])}${l.transporterName ? ` &middot; ${esc(l.transporterName)}` : ''}</td></tr>
<tr><td>Destination</td><td>${esc(l.destination)}</td></tr>
<tr><td>Invoice</td><td>${esc(o.sale?.invoiceNumber)}</td></tr>
<tr><td>Loaded</td><td>${esc(when(l.loadedAt))} by ${esc(l.loadedByName)}</td></tr>
</table>
<div class="sign"><div>Warehouse keeper</div><div>Driver</div><div>Security</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

/** One order with its payment gate, truck loads, who/what/when timeline, and the actions the viewer's grants allow. */
export default function OrderDetail({ orderId, onChanged }: { orderId: string; onChanged?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = (resource: string, action: string) => hasPermission(user, resource, action);
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'' | 'cancel' | 'approve' | 'load' | 'short'>('');
  const [receiving, setReceiving] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const fetchOrder = useCallback(
    () => saleOrdersApi.get(orderId).then((r) => { setOrder(r.data); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load the order'))),
    [orderId],
  );
  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const run = async (fn: () => Promise<{ data: OrderDetailData }>) => {
    setBusy(true); setError('');
    try {
      const res = await fn();
      setOrder(res.data); setPanel(''); setReceiving(null); setF({}); onChanged?.();
    } catch (e) {
      setError(apiErrorMessage(e, 'That action failed'));
    } finally { setBusy(false); }
  };

  if (!order) return <div style={{ padding: 24, color: 'var(--text-3)' }}>{error || 'Loading order…'}</div>;
  const o = order;
  const gate = o.payment;
  const open = o.status === 'RESERVED' || o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RELEASED';
  const loading = o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RELEASED';
  const deskEdit = can('warehouse_desk', 'EDIT');
  const canApprove = can('release_approvals', 'EDIT');
  const allDelivered = o.loads.length > 0 && o.loads.every((l) => l.status === 'DELIVERED');
  const pct = Math.min(100, (o.loadedKg / o.quantityKg) * 100);

  return (
    <div className="so-detail">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <div className="so-head">
        <div>
          <div className="so-ref">{o.reference}</div>
          <div className="ua-hint">Given to {o.buyer.name} to present at {o.warehouse.name}</div>
        </div>
        <StatusChip status={o.status} />
      </div>

      <dl className="so-grid">
        <div><dt>Buyer</dt><dd>{o.buyer.name}{o.buyer.contactPhone ? ` · ${o.buyer.contactPhone}` : ''}</dd></div>
        <div><dt>Ordered</dt><dd>{kg(o.quantityKg)}{o.packaging ? ` · ${o.packaging}` : ''} · lot {o.lot.lotNumber}</dd></div>
        <div><dt>Amount</dt><dd>{money(o.amount)} <span className="ua-hint">({money(o.pricePerKg)}/kg)</span></dd></div>
        <div><dt>Invoice</dt><dd>{o.sale?.invoiceNumber ?? 'Created when confirmed'}</dd></div>
        <div><dt>Transport</dt><dd>{o.needsTransport ? 'We deliver to the buyer' : 'Buyer collects'}</dd></div>
        <div><dt>Created by</dt><dd>{o.createdByName ?? '—'}</dd></div>
      </dl>

      {o.status !== 'CANCELLED' && o.status !== 'RESERVED' && (
        <div>
          <div className="so-progress-label"><span>Loaded {kg(o.loadedKg)} of {kg(o.quantityKg)}</span><span>{o.remainingKg > 0 ? `${kg(o.remainingKg)} to go` : 'Fully loaded'}</span></div>
          <div className="so-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {o.status !== 'CANCELLED' && (
        <div className={`so-gate ${gate.canRelease ? 'is-ok' : 'is-warn'}`}>
          <strong>Payment</strong>{' '}
          {gate.paid ? (loading ? 'Received. Trucks can be loaded.' : 'Received.')
            : gate.creditApproved ? `Credit approved (${o.creditTermDays} days) by ${gate.creditApprovedByName}.${loading ? ' Trucks can be loaded.' : ''}`
            : gate.releaseApproved ? `Unpaid loading approved by ${gate.releaseApprovedByName}.`
            : o.status === 'RESERVED' ? 'Checked when the first truck is loaded.'
            : 'Not received. A manager must approve credit or an unpaid release before the first truck is loaded.'}
          {o.sale && !gate.paid && <> Record payment in <Link href="/dashboard/sales">Sales &amp; Payments</Link>.</>}
        </div>
      )}

      {o.loads.length > 0 && (
        <div className="so-loads">
          {o.loads.map((l) => (
            <div key={l.id} className="so-load">
              <div className="so-load-head">
                <b>Load {l.sequence} · {kg(l.weightKg)}{l.bagCount ? ` · ${l.bagCount} bags` : ''}</b>
                <span className={`so-chip is-${l.status === 'DELIVERED' ? 'completed' : l.status === 'IN_TRANSIT' ? 'confirmed' : 'reserved'}`}>{LOAD_LABEL[l.status]}</span>
              </div>
              <div className="ua-hint">
                {l.vehiclePlate} · {l.driverName}{l.driverPhone ? ` (${l.driverPhone})` : ''} · {MODE_LABEL[l.mode]}{l.transporterName ? ` · ${l.transporterName}` : ''}{l.fee ? ` · fee ${money(l.fee)}` : ''}
                {l.receivedBy ? ` · received by ${l.receivedBy}` : ''}
              </div>
              <div className="so-actions">
                <button className="btn-secondary ua-action" onClick={() => printGatePass(o, l)}>Print gate pass</button>
                {deskEdit && l.status === 'ASSIGNED' && l.mode !== 'BUYER_PICKUP' && <button className="btn-secondary ua-action" disabled={busy} onClick={() => run(() => saleOrdersApi.loadStatus(o.id, l.id, { status: 'IN_TRANSIT' }))}>Truck left</button>}
                {deskEdit && ['ASSIGNED', 'IN_TRANSIT'].includes(l.status) && l.mode !== 'BUYER_PICKUP' && <button className="btn-secondary ua-action" disabled={busy} onClick={() => { setReceiving(receiving === l.id ? null : l.id); setF({}); }}>Mark delivered</button>}
              </div>
              {receiving === l.id && (
                <form className="so-panel" onSubmit={(e) => { e.preventDefault(); run(() => saleOrdersApi.loadStatus(o.id, l.id, { status: 'DELIVERED', receivedBy: f.by, proofNote: f.proof || undefined })); }}>
                  <label className="ua-label" htmlFor="so-by">Received by</label>
                  <input id="so-by" className="input-field" required value={f.by ?? ''} onChange={(e) => set('by', e.target.value)} />
                  <label className="ua-label" htmlFor="so-proof">Note<span className="ua-opt">optional</span></label>
                  <input id="so-proof" className="input-field" value={f.proof ?? ''} onChange={(e) => set('proof', e.target.value)} />
                  <button className="btn-primary" disabled={busy}>Confirm delivery</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="so-actions">
        {o.status === 'RESERVED' && deskEdit && <button className="btn-primary" disabled={busy} onClick={() => run(() => saleOrdersApi.confirm(o.id))}>Confirm sale</button>}
        {loading && deskEdit && <button className="btn-primary" disabled={busy || !gate.canRelease} onClick={() => { setPanel('load'); setF({ weight: String(Math.round(o.remainingKg * 100) / 100) }); }}>Load a truck</button>}
        {open && canApprove && !gate.paid && !gate.creditApproved && !gate.releaseApproved && <button className="btn-secondary" disabled={busy} onClick={() => setPanel('approve')}>Approve credit / unpaid loading</button>}
        {o.status === 'PARTIALLY_RELEASED' && canApprove && <button className="btn-secondary" disabled={busy} onClick={() => setPanel('short')}>Close short</button>}
        {o.status === 'RELEASED' && deskEdit && allDelivered && gate.paid && <button className="btn-primary" disabled={busy} onClick={() => run(() => saleOrdersApi.complete(o.id))}>Complete order</button>}
        {o.status === 'RESERVED' && can('sale_orders', 'EDIT') && <button className="btn-secondary ua-action is-danger" disabled={busy} onClick={() => setPanel('cancel')}>Cancel order</button>}
      </div>
      {o.status === 'RESERVED' && o.expiresAt && <div className="ua-hint">If it is not confirmed, this reservation is released automatically on {new Date(o.expiresAt).toLocaleDateString()}.</div>}
      {loading && !gate.canRelease && deskEdit && <div className="ua-hint">Loading is locked until payment is received or a manager approves.</div>}
      {o.status === 'RELEASED' && deskEdit && !(allDelivered && gate.paid) && <div className="ua-hint">To complete: every truck must be delivered{gate.paid ? '' : ' and the sale paid'}.</div>}

      {panel === 'cancel' && (
        <form className="so-panel" onSubmit={(e) => { e.preventDefault(); run(() => saleOrdersApi.cancel(o.id, f.reason ?? '')); }}>
          <label className="ua-label" htmlFor="so-reason">Reason for cancelling</label>
          <input id="so-reason" className="input-field" required minLength={3} value={f.reason ?? ''} onChange={(e) => set('reason', e.target.value)} />
          <button className="btn-primary" disabled={busy}>Cancel this order</button>
        </form>
      )}
      {panel === 'short' && (
        <form className="so-panel" onSubmit={(e) => { e.preventDefault(); run(() => saleOrdersApi.closeShort(o.id, f.reason ?? '')); }}>
          <div className="ua-hint">
            The buyer will not collect the remaining {kg(o.remainingKg)}. The order closes at the {kg(o.loadedKg)} already loaded, that stock goes back on sale,
            and the invoice and farmer payouts are reduced to match ({money(o.loadedKg * o.pricePerKg)}). This is refused once payment has been settled.
          </div>
          <label className="ua-label" htmlFor="so-short">Reason</label>
          <input id="so-short" className="input-field" required minLength={3} value={f.reason ?? ''} onChange={(e) => set('reason', e.target.value)} />
          <button className="btn-primary" disabled={busy}>Close at {kg(o.loadedKg)}</button>
        </form>
      )}
      {panel === 'approve' && (
        <form className="so-panel" onSubmit={(e) => { e.preventDefault(); run(() => saleOrdersApi.approve(o.id, { kind: f.kind || 'CREDIT', creditTermDays: f.kind === 'RELEASE' ? undefined : Number(f.days || 14), note: f.note })); }}>
          <label className="ua-label" htmlFor="so-kind">Approval</label>
          <select id="so-kind" className="input-field" value={f.kind || 'CREDIT'} onChange={(e) => set('kind', e.target.value)}>
            <option value="CREDIT">Credit term (buyer pays later)</option>
            <option value="RELEASE">Allow loading unpaid, once</option>
          </select>
          {(f.kind || 'CREDIT') === 'CREDIT' && (<>
            <label className="ua-label" htmlFor="so-days">Days to pay</label>
            <input id="so-days" className="input-field" type="number" min={1} value={f.days ?? '14'} onChange={(e) => set('days', e.target.value)} />
          </>)}
          <label className="ua-label" htmlFor="so-note">Why</label>
          <input id="so-note" className="input-field" required minLength={3} value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} />
          <button className="btn-primary" disabled={busy}>Approve</button>
        </form>
      )}
      {panel === 'load' && (
        <form className="so-panel" onSubmit={(e) => { e.preventDefault(); run(() => saleOrdersApi.loadTruck(o.id, { weightKg: Number(f.weight), bagCount: f.bags ? Number(f.bags) : undefined, vehiclePlate: f.plate, driverName: f.driver, driverPhone: f.phone || undefined, mode: o.needsTransport ? (f.mode || 'OWN_FLEET') : 'BUYER_PICKUP', transporterName: f.transporter || undefined, fee: f.fee ? Number(f.fee) : undefined, destination: f.dest || undefined, notes: f.notes || undefined })); }}>
          <div className="ua-hint">{kg(o.remainingKg)} still to load. Enter what the weighbridge shows for this truck; stock is deducted by that weight.</div>
          <div className="ua-row">
            <div className="ua-field"><label className="ua-label" htmlFor="so-w">Weighed weight (kg)</label><input id="so-w" className="input-field" type="number" min={1} step="any" required value={f.weight ?? ''} onChange={(e) => set('weight', e.target.value)} /></div>
            <div className="ua-field"><label className="ua-label" htmlFor="so-bags">Bags<span className="ua-opt">optional</span></label><input id="so-bags" className="input-field" type="number" min={1} value={f.bags ?? ''} onChange={(e) => set('bags', e.target.value)} /></div>
          </div>
          <div className="ua-row">
            <div className="ua-field"><label className="ua-label" htmlFor="so-pl">Truck plate number</label><input id="so-pl" className="input-field" required placeholder="e.g. T 123 ABC" value={f.plate ?? ''} onChange={(e) => set('plate', e.target.value)} /></div>
            <div className="ua-field"><label className="ua-label" htmlFor="so-dr">Driver</label><input id="so-dr" className="input-field" required value={f.driver ?? ''} onChange={(e) => set('driver', e.target.value)} /></div>
          </div>
          <div className="ua-field"><label className="ua-label" htmlFor="so-ph">Driver phone<span className="ua-opt">optional</span></label><input id="so-ph" className="input-field" type="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
          {o.needsTransport && (<>
            <div className="ua-field">
              <label className="ua-label" htmlFor="so-mode">Who is carrying it</label>
              <select id="so-mode" className="input-field" value={f.mode || 'OWN_FLEET'} onChange={(e) => set('mode', e.target.value)}>
                <option value="OWN_FLEET">Our own vehicle</option>
                <option value="HIRED">Hired transporter</option>
              </select>
            </div>
            {f.mode === 'HIRED' && <div className="ua-field"><label className="ua-label" htmlFor="so-tr">Transporter</label><input id="so-tr" className="input-field" required value={f.transporter ?? ''} onChange={(e) => set('transporter', e.target.value)} /></div>}
            <div className="ua-row">
              <div className="ua-field"><label className="ua-label" htmlFor="so-fee">Transport fee (TZS)<span className="ua-opt">optional</span></label><input id="so-fee" className="input-field" type="number" min={0} value={f.fee ?? ''} onChange={(e) => set('fee', e.target.value)} /></div>
              <div className="ua-field"><label className="ua-label" htmlFor="so-dest">Destination<span className="ua-opt">optional</span></label><input id="so-dest" className="input-field" value={f.dest ?? ''} onChange={(e) => set('dest', e.target.value)} /></div>
            </div>
          </>)}
          <button className="btn-primary" disabled={busy}>Load this truck</button>
        </form>
      )}

      <h3 className="ua-section-title" style={{ marginTop: 20 }}>Who did what, and when</h3>
      <ol className="so-timeline">
        {o.events.map((e) => {
          const d = (e.data ?? {}) as Record<string, unknown>;
          const extra = e.type === 'order.truck_loaded' ? ` — load ${d.load}, ${d.weightKg} kg, ${d.vehiclePlate}`
            : e.type.startsWith('load.') ? ` — load ${d.load}, ${d.vehiclePlate}${d.receivedBy ? `, received by ${d.receivedBy}` : ''}` : '';
          return (
            <li key={e.id}>
              <div className="so-tl-title">{(EVENT_LABEL[e.type] ?? e.type) + extra}</div>
              <div className="so-tl-meta">{e.actorName ?? 'System'} · {when(e.createdAt)}</div>
              {e.note && <div className="so-tl-note">{e.note}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
