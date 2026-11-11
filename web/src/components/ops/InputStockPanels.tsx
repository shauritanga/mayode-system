'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other warehouse panels */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { inputStockApi, opsApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { dateTime, kg } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, Toolbar, useLoad } from './ui';

const CLASS_LABEL: Record<string, string> = { INPUT: 'Farm input', FUEL: 'Fuel', PACKAGING: 'Packaging bags', PADDY: 'Paddy', RICE: 'Rice', BYPRODUCT: 'By-product' };
const MOVE_LABEL: Record<string, string> = { IN: 'Received', OUT: 'Used / given out', ADJUSTMENT: 'Correction', TRANSFER_OUT: 'Moved out', TRANSFER_IN: 'Moved in', WRITE_OFF: 'Written off', COUNT_ADJUSTMENT: 'Count correction' };
const REASONS: [string, string][] = [['DAMAGED', 'Damaged'], ['EXPIRED', 'Expired'], ['LOST', 'Lost or stolen'], ['FOUND', 'Found (add)'], ['COUNT_CORRECTION', 'Count correction'], ['OTHER', 'Other (explain)']];
const SOURCES: [string, string][] = [['PURCHASE', 'Bought from a supplier'], ['DIRECT', 'Delivered / brought in'], ['DONATION', 'Donation'], ['OPENING', 'Stock already here (opening balance)']];
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString();

const card: React.CSSProperties = { background: 'var(--bg-elevated, rgba(127,127,127,.08))', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px' };
const errOf = (e: unknown) => apiErrorMessage(e, 'That did not work.');

// ───────────────────────── receiving inputs, fuel and bags ─────────────────────────
export function InputReceivePanel({ canReceive, onDone }: { canReceive: boolean; onDone?: () => void }) {
  const stock = useLoad<any>(() => inputStockApi.overview(), []);
  const [item, setItem] = useState(''); const [warehouse, setWarehouse] = useState(''); const [qty, setQty] = useState(''); const [source, setSource] = useState('PURCHASE');
  const [supplier, setSupplier] = useState(''); const [reference, setReference] = useState(''); const [cost, setCost] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('');
  const items = useMemo(() => {
    const seen = new Map<string, any>();
    for (const r of stock.data?.data ?? []) if (r.isActive && !seen.has(r.itemId)) seen.set(r.itemId, r);
    return [...seen.values()];
  }, [stock.data]);
  const warehouses: any[] = stock.data?.warehouses ?? [];
  const chosen = items.find((i) => i.itemId === item);
  const wh = warehouse || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '';
  const whName = warehouses.find((w) => w.id === wh)?.name;
  const needsWho = source === 'PURCHASE' || source === 'DIRECT';
  const ok = canReceive && !!chosen && Number(qty) > 0 && (!needsWho || supplier.trim() || reference.trim()) && !busy;
  const save = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      await inputStockApi.receive({ itemId: item, warehouseId: wh || undefined, quantity: Number(qty), source, supplierName: supplier || undefined, reference: reference || undefined, unitCost: cost === '' ? undefined : Number(cost), note: note || undefined });
      setDone(`${n3(Number(qty))} ${chosen.unit} of ${chosen.name} added to ${whName ?? 'the warehouse'}.`);
      setQty(''); setReference(''); setNote(''); setCost(''); stock.reload(); onDone?.();
    } catch (e) { setError(errOf(e)); } finally { setBusy(false); }
  };
  if (stock.loading && !stock.data) return <Loading />;
  return (
    <div style={{ maxWidth: 760 }}>
      <ErrorNote message={stock.error || error} />
      {done && <div className="alert-box" style={{ marginBottom: 12, color: 'var(--green-400, #4ade80)' }}>{done}</div>}
      {!items.length ? (
        <div style={card}><strong>Nothing to receive yet.</strong><p className="muted" style={{ margin: '6px 0 0' }}>First add what you stock, such as Urea, diesel or empty bags, in <Link href="/dashboard/amcos-settings/farm-inputs?add=1">Settings → Farm inputs</Link>. Then come back here to receive it into a warehouse.</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (ok) void save(); }}>
          <p className="muted" style={{ marginTop: 0 }}>Goods arrive here: choose what came in, how much, which warehouse it was put in, and where it came from. It then shows in <strong>Stock</strong>.</p>
          <FormGrid>
            <Field label="What arrived *"><select className="input-field" value={item} onChange={(e) => setItem(e.target.value)}><option value="">Choose…</option>{items.map((i) => <option key={i.itemId} value={i.itemId}>{i.name} ({CLASS_LABEL[i.stockClass]})</option>)}</select></Field>
            <Field label="Quantity *" hint={chosen ? `in ${chosen.unit}` : undefined}><input className="input-field" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Put into warehouse *"><select className="input-field" value={wh} onChange={(e) => setWarehouse(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (main)' : ''}</option>)}</select></Field>
            <Field label="Where did it come from? *"><select className="input-field" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            {needsWho && <Field label="Supplier / who brought it"><input className="input-field" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Agro Supplies Ltd" /></Field>}
            {needsWho && <Field label="Delivery note / reference"><input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Needed if no supplier name" /></Field>}
            <Field label="Cost per unit (TZS)" hint="Optional"><input className="input-field" type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
            <Field label="Note" hint="Optional"><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </FormGrid>
          {chosen && Number(qty) > 0 && <div style={{ ...card, marginTop: 14, fontSize: 13 }}>After this, <strong>{chosen.name}</strong> in {whName}: <strong>{n3((stock.data?.data ?? []).filter((r: any) => r.itemId === chosen.itemId && r.warehouseId === wh).reduce((t: number, r: any) => t + r.balance, 0) + Number(qty))} {chosen.unit}</strong></div>}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn-primary" disabled={!ok}>{busy ? 'Saving…' : 'Add to stock'}</button>
            <span className="muted" style={{ fontSize: 12 }}>Receiving against a purchase order? Open <Link href="/dashboard/purchase-orders">Purchase Orders</Link> and use “Receive goods”: pick the warehouse there.</span>
          </div>
        </form>
      )}
    </div>
  );
}

// ───────────────────────── history, correct, move ─────────────────────────
function MovementsModal({ row, onClose, canReverse, onChanged }: { row: { itemId: string; name: string; unit: string; warehouseId?: string | null; warehouse?: string | null }; onClose: () => void; canReverse: boolean; onChanged: () => void }) {
  const list = useLoad<any>(() => inputStockApi.movements({ itemId: row.itemId, limit: 200 }), []);
  const [reversing, setReversing] = useState<any>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const doReverse = async () => {
    setBusy(true); setError('');
    try { await inputStockApi.reverse(reversing.id, reason); setReversing(null); setReason(''); list.reload(); onChanged(); } catch (e) { setError(errOf(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`History · ${row.name}`} subtitle="Every time this item came in, went out or was corrected, newest first." width="860px" onClose={onClose} footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <ErrorNote message={list.error || error} />
      {list.loading && !list.data ? <Loading /> : (
        <DataTable rows={list.data?.data ?? []} rowKey={(r: any) => r.id} pageSize={8} empty="No movements yet."
          columns={[
            { header: 'When', render: (r: any) => dateTime(r.at) },
            { header: 'What', render: (r: any) => <span>{MOVE_LABEL[r.type] ?? r.type}{r.reversed && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Reversed</span>}{r.isReversal && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Reversal</span>}</span> },
            { header: 'Warehouse', render: (r: any) => r.warehouse ?? '—' },
            { header: 'Quantity', align: 'right', render: (r: any) => <strong style={{ color: r.quantity < 0 ? 'var(--red-400)' : undefined }}>{r.quantity > 0 ? '+' : ''}{n3(r.quantity)} {r.unit}</strong> },
            { header: 'Why / from', render: (r: any) => <span>{[r.supplier, r.reason && r.reason !== 'REVERSAL' ? REASONS.find(([k]) => k === r.reason)?.[1] ?? r.reason : '', r.note].filter(Boolean).join(' · ') || '—'}<div className="muted" style={{ fontSize: 11 }}>{r.by ?? ''}</div></span> },
            { header: '', align: 'right', render: (r: any) => canReverse && !r.reversed && !r.isReversal && !/TRANSFER/.test(r.type) ? <button type="button" className="btn-secondary" onClick={() => { setReason(''); setError(''); setReversing(r); }}>Undo</button> : null },
          ]} />
      )}
      {reversing && (
        <Modal title="Undo this movement?" width="440px" onClose={() => !busy && setReversing(null)}
          footer={<><button type="button" className="btn-secondary" onClick={() => setReversing(null)} disabled={busy}>Keep it</button><button type="button" className="btn-primary" disabled={busy || reason.trim().length < 5} onClick={() => void doReverse()}>{busy ? 'Working…' : 'Undo it'}</button></>}>
          <p style={{ marginTop: 0, fontSize: 14 }}>{MOVE_LABEL[reversing.type]} · {n3(reversing.quantity)} {reversing.unit}. The opposite movement is added; the original stays in the history.</p>
          <Field label="Why?"><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice by mistake" /></Field>
        </Modal>
      )}
    </Modal>
  );
}

function CorrectModal({ row, warehouses, onClose, onDone }: { row: any; warehouses: any[]; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'adjust' | 'transfer'>('adjust');
  const [reason, setReason] = useState('DAMAGED'); const [qty, setQty] = useState(''); const [note, setNote] = useState(''); const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const adds = reason === 'FOUND';
  const others = warehouses.filter((w) => w.id !== row.warehouseId);
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (mode === 'transfer') await inputStockApi.transfer({ itemId: row.itemId, fromWarehouseId: row.warehouseId, toWarehouseId: to, quantity: Number(qty), note: note || undefined });
      else await inputStockApi.adjust({ itemId: row.itemId, warehouseId: row.warehouseId, quantity: (adds ? 1 : -1) * Math.abs(Number(qty)), reason, note: note || undefined });
      onDone(); onClose();
    } catch (e) { setError(errOf(e)); setBusy(false); }
  };
  const ready = Number(qty) > 0 && (mode === 'adjust' ? reason !== 'OTHER' || note.trim() : !!to);
  return (
    <Modal title={`${row.name} · ${row.warehouse ?? ''}`} subtitle={`In stock here: ${n3(row.balance)} ${row.unit}`} width="520px" onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !ready} onClick={() => void save()}>{busy ? 'Saving…' : mode === 'transfer' ? 'Move it' : 'Save correction'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <ErrorNote message={error} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={mode === 'adjust' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('adjust')}>Take off / add (correction)</button>
          <button type="button" className={mode === 'transfer' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('transfer')} disabled={!others.length}>Move to another warehouse</button>
        </div>
        {mode === 'adjust' && <Field label="Reason *"><select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.filter(([k]) => k !== 'COUNT_CORRECTION').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
        {mode === 'transfer' && <Field label="Move to *"><select className="input-field" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose a warehouse…</option>{others.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}
        <Field label={`${mode === 'transfer' ? 'How much' : adds ? 'How much was found' : 'How much to take off'} (${row.unit}) *`}><input className="input-field" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note" hint={mode === 'adjust' && reason === 'OTHER' ? 'Required for “Other”' : 'Optional'}><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ───────────────────────── everything in the warehouses, in one table ─────────────────────────
type Row = { key: string; kind: string; name: string; warehouse: string; warehouseId: string | null; balance: number; unit: string; low: boolean; value: number | null; input?: any; free?: number };

/** Rice, by-products, farm inputs, fuel and bags together: what we hold, where, and what is running low. */
export function AllStockPanel({ canRice, canInputs, canAdjust, onChanged }: { canRice: boolean; canInputs: boolean; canAdjust: boolean; onChanged?: () => void }) {
  const rice = useLoad<any[]>(() => (canRice ? opsApi.position() : Promise.resolve({ data: [] })), [canRice]);
  const inputs = useLoad<any>(() => (canInputs ? inputStockApi.overview() : Promise.resolve({ data: { data: [], warehouses: [] } })), [canInputs]);
  const [warehouse, setWarehouse] = useState(''); const [kind, setKind] = useState(''); const [q, setQ] = useState(''); const [low, setLow] = useState(false);
  const [history, setHistory] = useState<any>(null); const [fix, setFix] = useState<any>(null);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const r of rice.data ?? []) out.push({ key: `r-${r.productId}-${r.warehouseId}`, kind: r.category === 'PADDY' ? 'PADDY' : r.category === 'BYPRODUCT' ? 'BYPRODUCT' : 'RICE', name: r.product, warehouse: r.warehouse, warehouseId: r.warehouseId, balance: Number(r.closingKg) || 0, unit: 'kg', low: !!r.lowStock, value: r.stockValue ?? null, free: Number(r.availableKg) || 0 });
    for (const r of inputs.data?.data ?? []) out.push({ key: `i-${r.itemId}-${r.warehouseId ?? 'none'}`, kind: r.stockClass, name: r.name, warehouse: r.warehouse ?? '—', warehouseId: r.warehouseId, balance: r.balance, unit: r.unit, low: r.low, value: r.unitCost ? r.balance * r.unitCost : null, input: r });
    return out;
  }, [rice.data, inputs.data]);
  const warehouses = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.warehouseId) m.set(r.warehouseId, r.warehouse);
    for (const w of inputs.data?.warehouses ?? []) m.set(w.id, w.name);
    return [...m.entries()];
  }, [rows, inputs.data]);
  const shown = rows.filter((r) => (!warehouse || r.warehouseId === warehouse) && (!kind || r.kind === kind) && (!low || r.low) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const lowCount = rows.filter((r) => r.low).length;
  const chips: [string, string][] = [['', 'Everything'], ['PADDY', 'Paddy'], ['RICE', 'Rice'], ['BYPRODUCT', 'By-products'], ['INPUT', 'Farm inputs'], ['FUEL', 'Fuel'], ['PACKAGING', 'Bags']];
  const reloadAll = () => { rice.reload(); inputs.reload(); onChanged?.(); };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {chips.map(([k, l]) => <button key={k} type="button" className={kind === k ? 'btn-primary' : 'btn-secondary'} style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <Toolbar right={<label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />Only what is running low{lowCount ? ` (${lowCount})` : ''}</label>}>
        <Field label="Warehouse"><select className="input-field" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}><option value="">All warehouses</option>{warehouses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Search"><input className="input-field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name…" /></Field>
      </Toolbar>
      <ErrorNote message={rice.error || inputs.error} />
      {(rice.loading && !rice.data) || (inputs.loading && !inputs.data) ? <Loading /> : (
        <DataTable rows={shown} rowKey={(r) => r.key} empty="Nothing in stock matches. Use Receive to add stock."
          columns={[
            { header: 'Item', render: (r) => <span><strong>{r.name}</strong>{r.low && <span className="badge badge-red" style={{ marginLeft: 6 }}>Running low</span>}</span> },
            { header: 'Kind', render: (r) => CLASS_LABEL[r.kind] ?? r.kind },
            { header: 'Warehouse', render: (r) => r.warehouse },
            { header: 'In stock', align: 'right', render: (r) => <strong>{r.unit === 'kg' ? kg(r.balance) : `${n3(r.balance)} ${r.unit}`}</strong> },
            { header: 'Value', align: 'right', render: (r) => (r.value != null && r.value > 0 ? `TZS ${Math.round(r.value).toLocaleString()}` : '—') },
            { header: '', align: 'right', render: (r) => r.input ? <span style={{ whiteSpace: 'nowrap' }}><button type="button" className="btn-secondary" onClick={() => setHistory(r.input)}>History</button>{canAdjust && r.warehouseId && r.balance > 0 && <> <button type="button" className="btn-secondary" onClick={() => setFix(r.input)}>Correct / move</button></>}</span> : <span className="muted" style={{ fontSize: 12 }}>See Batches and History tabs</span> },
          ]} />
      )}
      {history && <MovementsModal row={history} canReverse={canAdjust} onClose={() => setHistory(null)} onChanged={reloadAll} />}
      {fix && <CorrectModal row={fix} warehouses={(inputs.data?.warehouses ?? [])} onClose={() => setFix(null)} onDone={reloadAll} />}
    </>
  );
}

// ───────────────────────── how it works, and give-out hub ─────────────────────────
export function HowItWorks({ goto, can }: { goto: (page: 'receive' | 'stock' | 'giveout') => void; can: (r: string) => boolean }) {
  const steps: { n: number; title: string; text: string; go?: () => void }[] = [
    { n: 1, title: 'Receive', text: 'Everything that arrives, rice from farmers or inputs, fuel and bags from suppliers, is received into a warehouse.', go: can('ops_receiving') ? () => goto('receive') : undefined },
    { n: 2, title: 'Stock', text: 'One list shows what each warehouse holds, what is running low, and every movement.', go: can('ops_stock') ? () => goto('stock') : undefined },
    { n: 3, title: 'Give out or send out', text: 'Inputs go to farmers or to field work; rice is sent to buyers. Stock goes down and the record is kept.', go: () => goto('giveout') },
    { n: 4, title: 'Count and correct', text: 'Count what is on the shelf, move stock between warehouses, and correct mistakes with a reason.', go: can('ops_stock') ? () => goto('stock') : undefined },
  ];
  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <strong>How the warehouse works</strong>
      <div className="muted" style={{ fontSize: 13, margin: '2px 0 12px' }}>Every product, whether produce or an input, follows the same four steps.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {steps.map((s) => (
          <button key={s.n} type="button" disabled={!s.go} onClick={s.go} style={{ textAlign: 'left', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12, color: 'inherit', cursor: s.go ? 'pointer' : 'default' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-dim, rgba(52,211,153,.18))', color: 'var(--accent, #34d399)', fontWeight: 700, fontSize: 12, marginRight: 8 }}>{s.n}</span>
            <strong>{s.title}</strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{s.text}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function GiveOutHub({ children, can }: { children?: React.ReactNode; can: (r: string) => boolean }) {
  const tiles: { title: string; text: string; href?: string; show: boolean }[] = [
    { title: 'Give inputs to a farmer', text: 'Fertiliser, seed and chemicals on credit. Stock goes down and the farmer confirms with a code.', href: '/dashboard/inputs', show: can('input_distribution') },
    { title: 'Used in field work', text: 'Inputs used on a farm task leave the warehouse automatically when the task report is approved.', show: true },
    { title: 'Damaged, expired or lost', text: 'Take it off with a reason: open Stock, then “Correct / move” on the item.', show: can('ops_stock') },
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 18 }}>
        {tiles.filter((t) => t.show).map((t) => (
          <div key={t.title} style={card}>
            <strong>{t.title}</strong>
            <div className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>{t.text}</div>
            {t.href && <Link href={t.href} className="btn-secondary">Open</Link>}
          </div>
        ))}
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Send out rice</h3>
      {children}
    </>
  );
}

/** Lets a purchase-order receipt name the warehouse: used by the Purchase Orders screen. */
export function useWarehouseChoices() {
  return useLoad<any>(() => inputStockApi.overview(), []);
}
