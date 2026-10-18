'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { dateTime, day, kg, label, tzs } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, Status, Tabs, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sub = 'position' | 'batches' | 'ledger' | 'transfers';

export default function StockPanel({ canAdjust, canTransfer }: { canAdjust: boolean; canTransfer: boolean }) {
  const [sub, setSub] = useState<Sub>('position');
  return (
    <>
      <Tabs tabs={[{ id: 'position', label: 'Stock position' }, { id: 'batches', label: 'Batches' }, { id: 'ledger', label: 'Stock history' }, { id: 'transfers', label: 'Transfers' }]} value={sub} onChange={setSub} />
      {sub === 'position' && <Position />}
      {sub === 'batches' && <Batches canAdjust={canAdjust} canTransfer={canTransfer} />}
      {sub === 'ledger' && <Ledger canAdjust={canAdjust} />}
      {sub === 'transfers' && <Transfers canTransfer={canTransfer} />}
    </>
  );
}

function Position() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');
  const { data, error, loading } = useLoad<any[]>(() => opsApi.position({ from: from || undefined, to: to || undefined, category: category || undefined }), [from, to, category]);
  return (
    <>
      <Toolbar>
        <Field label="Product kind"><select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All</option><option value="PADDY">Paddy</option><option value="PROCESSED">Processed rice</option><option value="BROKEN">Broken rice</option><option value="BYPRODUCT">By-products</option></select></Field>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(r) => r.productId + r.warehouseId} empty="No stock yet."
          columns={[{ header: 'Product', render: (r) => <span>{r.product}{r.lowStock && <span className="badge badge-red" style={{ marginLeft: 6 }}>Low</span>}</span> }, { header: 'Brand', render: (r) => r.brand ?? '—' }, { header: 'Warehouse', render: (r) => r.warehouse },
            { header: 'Opening', align: 'right', render: (r) => kg(r.openingKg) }, { header: 'Received', align: 'right', render: (r) => kg(r.receivedKg) }, { header: 'Milled', align: 'right', render: (r) => kg(r.processedOutKg) },
            { header: 'Produced', align: 'right', render: (r) => kg(r.producedKg) }, { header: 'Dispatched', align: 'right', render: (r) => kg(r.dispatchedKg) }, { header: 'Adjusted', align: 'right', render: (r) => kg(r.adjustmentsKg) },
            { header: 'Closing', align: 'right', render: (r) => <strong>{kg(r.closingKg)}</strong> }, { header: 'Reserved', align: 'right', render: (r) => kg(r.reservedKg) }, { header: 'Available', align: 'right', render: (r) => <strong>{kg(r.availableKg)}</strong> },
            { header: 'In transit', align: 'right', render: (r) => kg(r.inTransitKg) }, { header: 'Value', align: 'right', render: (r) => (r.indicativeValue != null ? tzs(r.indicativeValue) : '—') }]} />
      )}
    </>
  );
}

function Batches({ canAdjust, canTransfer }: { canAdjust: boolean; canTransfer: boolean }) {
  const [q, setQ] = useState('');
  const [inStock, setInStock] = useState(true);
  const [adjust, setAdjust] = useState<any>(null);
  const [transfer, setTransfer] = useState<any>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.batches({ q: q || undefined, inStock: inStock ? 'true' : undefined }), [q, inStock]);
  return (
    <>
      <Toolbar>
        <Field label="Search"><input className="input-field" placeholder="Batch reference" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />Only batches with stock</label>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(b) => b.id + b.warehouseId} empty="No batches."
          columns={[{ header: 'Batch', render: (b) => <strong>{b.reference}</strong> }, { header: 'Product', render: (b) => `${b.product.name}${b.product.brand ? ` · ${b.product.brand}` : ''}` }, { header: 'Variety', render: (b) => b.riceVariety ?? '—' },
            { header: 'Source', render: (b) => (b.receipt?.farmer ? `${b.receipt.farmer.firstName} ${b.receipt.farmer.lastName}` : b.receipt?.sellerName ?? label(b.origin)) }, { header: 'Created', render: (b) => day(b.createdAt) }, { header: 'Warehouse', render: (b) => b.warehouseName ?? '—' },
            { header: 'Physical', align: 'right', render: (b) => kg(b.physicalKg) }, { header: 'Reserved', align: 'right', render: (b) => kg(b.reservedKg) }, { header: 'Available', align: 'right', render: (b) => <strong>{kg(b.availableKg)}</strong> },
            { header: '', render: (b) => <span style={{ display: 'flex', gap: 6 }}>
              {canAdjust && <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); setAdjust(b); }}>Adjust</button>}
              {canTransfer && b.availableKg > 0 && <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); setTransfer(b); }}>Transfer</button>}</span> }]} />
      )}
      {adjust && <AdjustModal batch={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); reload(); }} />}
      {transfer && <TransferModal batch={transfer} onClose={() => setTransfer(null)} onSaved={() => { setTransfer(null); reload(); }} />}
    </>
  );
}

function AdjustModal({ batch, onClose, onSaved }: { batch: any; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'ADJUSTMENT' | 'WRITE_OFF'>('ADJUSTMENT');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const q = Number(qty);
  const submit = async () => { if ((await run(() => opsApi.adjustStock({ batchId: batch.id, warehouseId: batch.warehouseId, type, quantityKg: type === 'WRITE_OFF' ? -Math.abs(q) : q, reason }))) !== undefined) onSaved(); };
  return (
    <Modal title={`Adjust ${batch.reference}`} subtitle={`${batch.product.name} at ${batch.warehouseName} · ${kg(batch.physicalKg)} on hand`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !q || !reason.trim()} onClick={submit}>{busy ? 'Saving…' : 'Record adjustment'}</button></>}>
      <ErrorNote message={error} />
      <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 0 }}>Every adjustment is kept in the stock history with who made it and why. Nothing is overwritten.</p>
      <FormGrid>
        <Field label="Kind"><select className="input-field" value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="ADJUSTMENT">Correction (add or remove)</option><option value="WRITE_OFF">Write-off (damaged, spoiled, lost)</option></select></Field>
        <Field label="Quantity (kg)" hint={type === 'ADJUSTMENT' ? 'Use a minus sign to remove stock' : 'Enter the amount lost'}><input className="input-field" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Reason" wide><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function TransferModal({ batch, onClose, onSaved }: { batch: any; onClose: () => void; onSaved: () => void }) {
  const { data: lookups } = useLoad<any>(() => opsApi.lookups());
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const submit = async () => { if ((await run(() => opsApi.sendTransfer({ batchId: batch.id, fromWarehouseId: batch.warehouseId, toWarehouseId: to, quantityKg: Number(qty), note: note || undefined }))) !== undefined) onSaved(); };
  return (
    <Modal title={`Transfer ${batch.reference}`} subtitle={`${kg(batch.availableKg)} free at ${batch.warehouseName}`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !to || !(Number(qty) > 0)} onClick={submit}>{busy ? 'Sending…' : 'Send'}</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="To warehouse"><select className="input-field" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{lookups?.warehouses.filter((w: any) => w.id !== batch.warehouseId).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Quantity (kg)"><input className="input-field" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note" wide><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function Ledger({ canAdjust }: { canAdjust: boolean }) {
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reversing, setReversing] = useState<any>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const { data, error: loadError, loading, reload } = useLoad<any[]>(() => opsApi.ledger({ type: type || undefined, from: from || undefined, to: to || undefined }), [type, from, to]);
  const submit = async () => { if ((await run(() => opsApi.reverseEntry(reversing.id, reason))) !== undefined) { setReversing(null); setReason(''); reload(); } };
  return (
    <>
      <Toolbar>
        <Field label="Movement"><select className="input-field" value={type} onChange={(e) => setType(e.target.value)}><option value="">All</option>{['RECEIPT', 'PROCESS_OUT', 'PROCESS_IN', 'DISPATCH', 'ADJUSTMENT', 'WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN', 'REVERSAL'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={loadError || error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(e) => e.id} empty="No stock movements."
          columns={[{ header: 'When', render: (e) => dateTime(e.createdAt) }, { header: 'Movement', render: (e) => <Status value={e.type} /> }, { header: 'Batch', render: (e) => e.batch.reference }, { header: 'Product', render: (e) => e.batch.product.name },
            { header: 'Quantity', align: 'right', render: (e) => <span style={{ color: e.quantityKg < 0 ? 'var(--red-500)' : undefined }}>{e.quantityKg > 0 ? '+' : ''}{kg(e.quantityKg)}</span> }, { header: 'Reason', render: (e) => e.reason ?? e.refType ?? '—' },
            { header: '', render: (e) => (canAdjust && ['ADJUSTMENT', 'WRITE_OFF'].includes(e.type) ? <button className="btn-secondary" onClick={() => setReversing(e)}>Reverse</button> : null) }]} />
      )}
      {reversing && (
        <Modal title="Reverse this adjustment" subtitle={`${reversing.batch.reference} · ${kg(reversing.quantityKg)}`} onClose={() => setReversing(null)}
          footer={<><button className="btn-secondary" onClick={() => setReversing(null)}>Close</button><button className="btn-primary" disabled={busy || !reason.trim()} onClick={submit}>Reverse</button></>}>
          <ErrorNote message={error} />
          <Field label="Reason for reversing" wide><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}

function Transfers({ canTransfer }: { canTransfer: boolean }) {
  const { data, error: loadError, loading, reload } = useLoad<any[]>(() => opsApi.transfers());
  const { data: lookups } = useLoad<any>(() => opsApi.lookups());
  const [receiving, setReceiving] = useState<any>(null);
  const [got, setGot] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const wh = (id: string) => lookups?.warehouses.find((w: any) => w.id === id)?.name ?? '—';
  const submit = async () => { if ((await run(() => opsApi.receiveTransfer(receiving.id, Number(got), note || undefined))) !== undefined) { setReceiving(null); reload(); } };
  return (
    <>
      <ErrorNote message={loadError} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(t) => t.id} empty="No transfers."
          columns={[{ header: 'Transfer', render: (t) => <strong>{t.reference}</strong> }, { header: 'Sent', render: (t) => dateTime(t.sentAt) }, { header: 'From', render: (t) => wh(t.fromWarehouseId) }, { header: 'To', render: (t) => wh(t.toWarehouseId) },
            { header: 'Sent (kg)', align: 'right', render: (t) => kg(t.quantityKg) }, { header: 'Received (kg)', align: 'right', render: (t) => (t.receivedKg != null ? kg(t.receivedKg) : '—') }, { header: 'Status', render: (t) => <Status value={t.status} /> },
            { header: '', render: (t) => (canTransfer && t.status === 'IN_TRANSIT' ? <button className="btn-secondary" onClick={() => { setReceiving(t); setGot(String(t.quantityKg)); }}>Receive</button> : null) }]} />
      )}
      {receiving && (
        <Modal title={`Receive ${receiving.reference}`} subtitle={`${kg(receiving.quantityKg)} was sent`} onClose={() => setReceiving(null)}
          footer={<><button className="btn-secondary" onClick={() => setReceiving(null)}>Close</button><button className="btn-primary" disabled={busy || got === ''} onClick={submit}>Confirm receipt</button></>}>
          <ErrorNote message={error} />
          <FormGrid>
            <Field label="Weight that arrived (kg)" hint="Any shortfall is recorded as lost in transit"><input className="input-field" type="number" value={got} onChange={(e) => setGot(e.target.value)} /></Field>
            <Field label="Note"><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </FormGrid>
        </Modal>
      )}
    </>
  );
}
