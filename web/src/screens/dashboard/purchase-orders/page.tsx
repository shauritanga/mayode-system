'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { purchaseOrdersApi, suppliersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, TableSkeleton, errMsg, fmtDate, todayISO, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const TONE: Record<string, string> = { DRAFT: 'badge-gray', APPROVED: 'badge-blue', PARTIALLY_RECEIVED: 'badge-gold', RECEIVED: 'badge-green', CANCELLED: 'badge-red' };
const LABEL: Record<string, string> = { DRAFT: 'Waiting for the Manager', APPROVED: 'Approved: goods awaited', PARTIALLY_RECEIVED: 'Part delivered', RECEIVED: 'Fully delivered', CANCELLED: 'Cancelled' };

interface Line { itemName: string; unit: string; quantity: string; unitPrice: string; inputItemId: string }
const blank = (): Line => ({ itemName: '', unit: 'kg', quantity: '', unitPrice: '', inputItemId: '' });

function NewOrder({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const suppliers = useApi<any>(() => suppliersApi.getAll(), []);
  const [supplierId, setSupplierId] = useState(''); const [expectedOn, setExpectedOn] = useState(''); const [note, setNote] = useState(''); const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const list: any[] = Array.isArray(suppliers.data) ? suppliers.data : suppliers.data?.data ?? [];
  const sup = supplierId || list[0]?.id || '';
  const set = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((n, l) => n + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r: any = await purchaseOrdersApi.create({ supplierId: sup, expectedOn: expectedOn || undefined, note: note.trim() || undefined, lines: lines.map((l) => ({ itemName: l.itemName, unit: l.unit, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) });
      onDone(`${r.data.number} saved. The Manager must approve it before goods can be received.`);
    } catch (e) { setError(errMsg(e, 'Could not save the order.')); setBusy(false); }
  };
  return (
    <Modal title="New purchase order" subtitle="What you are ordering and from whom. A Manager approves it." onClose={() => !busy && onClose()} width="700px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !sup} onClick={save}>{busy ? 'Saving…' : 'Save order'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {!suppliers.loading && !list.length && <Notice tone="error">Add a supplier first (Suppliers page).</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Supplier"><select className="input-field" value={sup} onChange={(e) => setSupplierId(e.target.value)}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Expected on"><input type="date" className="input-field" min={todayISO()} value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} /></Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px 110px auto', gap: 8, alignItems: 'end' }}>
            <Field label={i === 0 ? 'Item' : ''}><input className="input-field" value={l.itemName} onChange={(e) => set(i, { itemName: e.target.value })} /></Field>
            <Field label={i === 0 ? 'Unit' : ''}><input className="input-field" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} /></Field>
            <Field label={i === 0 ? 'Qty' : ''}><input type="number" min={0} step="any" className="input-field" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></Field>
            <Field label={i === 0 ? 'Unit price' : ''}><input type="number" min={0} className="input-field" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></Field>
            <button type="button" className="btn-secondary" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((p) => p.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        <div><button type="button" className="btn-secondary" onClick={() => setLines((p) => [...p, blank()])}>Add a line</button></div>
        <Field label="Note"><input className="input-field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div style={{ textAlign: 'right' }}>Total <strong>{tzs(total)}</strong></div>
      </div>
    </Modal>
  );
}

function Receive({ po, onClose, onDone }: { po: any; onClose: () => void; onDone: (m: string) => void }) {
  const [qty, setQty] = useState<Record<string, string>>({}); const [note, setNote] = useState(''); const [dn, setDn] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    const lines = po.lines.filter((l: any) => Number(qty[l.id]) > 0).map((l: any) => ({ lineId: l.id, quantity: Number(qty[l.id]) }));
    if (!lines.length) { setError('Enter how much arrived on at least one line.'); return; }
    setBusy(true); setError('');
    try { const r: any = await purchaseOrdersApi.receive(po.id, { lines, note: note.trim() || undefined, deliveryNote: dn.trim() || undefined }); onDone(`Delivery recorded as ${r.data.receipts[r.data.receipts.length - 1].number}.`); }
    catch (e) { setError(errMsg(e, 'Could not record the delivery.')); setBusy(false); }
  };
  return (
    <Modal title={`Receive goods · ${po.number}`} subtitle="Enter what actually arrived. Farm inputs go into stock." onClose={() => !busy && onClose()} width="640px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Record delivery'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <table className="data-table"><thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Already in</th><th className="num">Arrived now</th></tr></thead><tbody>
          {po.lines.map((l: any) => <tr key={l.id}><td>{l.itemName}</td><td className="num">{l.quantity} {l.unit}</td><td className="num">{l.received}</td>
            <td className="num"><input type="number" min={0} max={l.outstanding} step="any" className="input-field" style={{ width: 100 }} disabled={l.outstanding <= 0} value={qty[l.id] ?? ''} onChange={(e) => setQty((p) => ({ ...p, [l.id]: e.target.value }))} /></td></tr>)}
        </tbody></table>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Supplier's delivery note no."><input className="input-field" maxLength={60} value={dn} onChange={(e) => setDn(e.target.value)} /></Field>
          <Field label="Note (damage, shortages…)"><input className="input-field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function Detail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (m: string) => void }) {
  const can = useCan();
  const d = useApi<any>(() => purchaseOrdersApi.get(id), [id]);
  const [sub, setSub] = useState<'receive' | 'cancel' | null>(null); const [error, setError] = useState('');
  const po = d.data;
  const act = async (fn: () => Promise<unknown>, msg: string) => { setError(''); try { await fn(); d.reload(); onChanged(msg); } catch (e) { setError(errMsg(e)); } };
  return (
    <Modal title={po ? `${po.number} · ${po.supplier?.name ?? ''}` : 'Purchase order'} onClose={onClose} width="680px" footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <LoadError message={d.error} onRetry={d.reload} />
      {error && <Notice tone="error">{error}</Notice>}
      {po && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div><span className={`badge ${TONE[po.status]}`}>{LABEL[po.status]}</span> <span className="muted" style={{ fontSize: 13 }}>{po.expectedOn ? `expected ${fmtDate(po.expectedOn)} · ` : ''}total {tzs(po.totalAmount)}</span></div>
          {po.cancelReason && <div className="muted">Cancelled: {po.cancelReason}</div>}
          <table className="data-table"><thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Price</th></tr></thead><tbody>
            {po.lines.map((l: any) => <tr key={l.id}><td>{l.itemName}{l.inputItemId && <span className="badge badge-gray" style={{ marginLeft: 6 }}>stock</span>}</td><td className="num">{l.quantity} {l.unit}</td><td className="num">{l.received}</td><td className="num">{tzs(l.unitPrice)}</td></tr>)}
          </tbody></table>
          {po.receipts.length > 0 && <div><strong>Delivery receipts</strong>{po.receipts.map((r: any) => <div key={r.id} style={{ fontSize: 13 }}>{r.number} · {fmtDate(r.receivedOn)}{r.deliveryNote ? ` · note ${r.deliveryNote}` : ''}{r.note ? ` · ${r.note}` : ''}</div>)}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {po.status === 'DRAFT' && can('purchase_order_approval', 'EDIT') && <button type="button" className="btn-primary" onClick={() => act(() => purchaseOrdersApi.approve(po.id), 'Order approved.')}>Approve</button>}
            {['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status) && can('purchase_orders', 'EDIT') && <button type="button" className="btn-primary" onClick={() => setSub('receive')}>Receive goods</button>}
            {['DRAFT', 'APPROVED'].includes(po.status) && !po.receipts.length && can('purchase_orders', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setSub('cancel')}>Cancel order</button>}
          </div>
        </div>
      )}
      {po && sub === 'receive' && <Receive po={po} onClose={() => setSub(null)} onDone={(m) => { setSub(null); d.reload(); onChanged(m); }} />}
      {po && sub === 'cancel' && <ConfirmDialog title="Cancel this order" danger askReason reasonLabel="Why is it cancelled?" confirmLabel="Cancel order" body={<>{po.number} will be closed. Nothing has been delivered against it.</>}
        onConfirm={async (reason) => { await purchaseOrdersApi.cancel(po.id, reason); d.reload(); onChanged('Order cancelled.'); }} onClose={() => setSub(null)} />}
    </Modal>
  );
}

/** Purchase orders to suppliers, approved by a Manager, and the delivery receipts that record what arrived. */
export default function PurchaseOrdersPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const [status, setStatus] = useState('ALL'); const [refresh, setRefresh] = useState(0); const [adding, setAdding] = useState(false); const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => purchaseOrdersApi.list({ status }), [status, refresh]);
  if (!can('purchase_orders', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the purchase orders permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Purchase Orders" /><Empty title="Purchase orders belong to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Order from suppliers, get the Manager’s approval, then record each delivery. Stock goes up when inputs arrive." />
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <select className="input-field" style={{ width: 230 }} aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All orders</option>{Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {can('purchase_orders', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>New order</button>}
      </div>
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="No purchase orders" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Order</th><th>Supplier</th><th>Status</th><th className="num">Total</th><th>Expected</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r.id)}><td><strong>{r.number}</strong><div className="muted" style={{ fontSize: 11 }}>{fmtDate(r.createdAt)}</div></td><td>{r.supplier}</td><td><span className={`badge ${TONE[r.status]}`}>{LABEL[r.status]}</span></td><td className="num">{tzs(r.totalAmount)}</td><td>{r.expectedOn ? fmtDate(r.expectedOn) : '—'}</td></tr>)}
        </tbody></table></div>
      )}
      {adding && <NewOrder onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); setMsg(m); setRefresh((n) => n + 1); }} />}
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={(m) => { setMsg(m); setRefresh((n) => n + 1); }} />}
    </div>
  );
}
