'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { inputWarehouseApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { Empty, LoadError, Notice, TableSkeleton, errMsg, fmtDate, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted, #94a3b8)', padding: '8px 12px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13 };
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const card: React.CSSProperties = { background: 'var(--bg-elevated, rgba(127,127,127,.08))', border: '1px solid var(--border-subtle)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' };

function Minimum({ w, line, canEdit, onSaved }: { w: any; line: any; canEdit: boolean; onSaved: (m: string) => void }) {
  const [v, setV] = useState(line.minQuantity == null ? '' : String(line.minQuantity)); const [busy, setBusy] = useState(false);
  const dirty = v !== (line.minQuantity == null ? '' : String(line.minQuantity));
  if (!canEdit) return <span>{line.minQuantity ?? '—'}</span>;
  const save = async () => {
    setBusy(true);
    try { await inputWarehouseApi.setMinimum({ warehouseId: w.warehouseId, itemId: line.itemId, minQuantity: v === '' ? null : Number(v) }); onSaved(v === '' ? 'Minimum removed.' : `Minimum for ${line.item} in ${w.warehouse} set to ${v} ${line.unit}.`); }
    catch (e) { onSaved(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min={0} step="any" className="input-field" style={{ width: 80, padding: '4px 8px', textAlign: 'right' }} placeholder="none" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save(); }} />
      {dirty && <button type="button" className="btn-secondary" style={{ padding: '3px 9px' }} disabled={busy} onClick={() => void save()}>Save</button>}
    </span>
  );
}

/** Each warehouse's books: what came in, what was moved, what farmers collected, what remains and the minimum, with the history of every handover. */
export function WarehouseStock() {
  const can = useCan(); const canEdit = can('input_distribution', 'EDIT');
  const [wid, setWid] = useState(''); const [tick, setTick] = useState(0); const [msg, setMsg] = useState('');
  const books = useApi<any>(() => inputWarehouseApi.books(wid ? { warehouseId: wid } : {}), [wid, tick]);
  const hist = useApi<any>(() => inputWarehouseApi.collections(wid ? { warehouseId: wid } : {}), [wid, tick]);
  const all: any[] = books.data?.data ?? []; const rows: any[] = hist.data?.data ?? [];
  const lows = all.flatMap((w) => w.lines.filter((l: any) => l.low).map((l: any) => ({ w, l })));
  const names = useApi<any>(() => inputWarehouseApi.books(), []);
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={books.error || hist.error} onRetry={() => setTick((n) => n + 1)} />
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Every movement of fertiliser is recorded: what each warehouse received, what was moved between warehouses, and what farmers collected. Stock is never changed without a record. Receiving and moving stock is done in <Link href="/dashboard/ops-warehouse">Warehouse</Link>.</p>
      {lows.map(({ w, l }) => (
        <div key={`${w.warehouseId}${l.itemId}`} role="alert" style={{ border: '1px solid #fbbf24', background: 'rgba(251,191,36,.1)', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
          <strong>{w.warehouse} is approaching its minimum {l.item} stock</strong> ({l.remaining} {l.unit} left, minimum {l.minQuantity}). Consider opening another warehouse or replenishing this one if distribution is continuing.
        </div>))}
      <div style={{ marginBottom: 14 }}>
        <select className="input-field" style={{ width: 'auto' }} value={wid} onChange={(e) => setWid(e.target.value)} aria-label="Warehouse"><option value="">All warehouses</option>{(names.data?.data ?? []).map((w: any) => <option key={w.warehouseId} value={w.warehouseId}>{w.warehouse}</option>)}</select>
      </div>
      {books.loading && !books.data ? <TableSkeleton cols={7} /> : !all.some((w) => w.lines.length) ? <Empty title="No fertiliser in any warehouse yet" hint="Record stock coming in from Warehouse → Add stock." /> : all.filter((w) => w.lines.length).map((w) => {
        const tot = (k: string) => w.lines.reduce((n: number, l: any) => n + (l[k] || 0), 0);
        return (
          <div key={w.warehouseId} style={card}>
            <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>{w.warehouse}</div>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}><th style={th}>Fertiliser</th><th style={{ ...th, textAlign: 'right' }}>Received</th><th style={{ ...th, textAlign: 'right' }}>Moved in</th><th style={{ ...th, textAlign: 'right' }}>Moved out</th><th style={{ ...th, textAlign: 'right' }}>Given to farmers</th><th style={{ ...th, textAlign: 'right' }}>Remaining</th><th style={{ ...th, textAlign: 'right' }}>Minimum</th></tr></thead>
              <tbody>
                {w.lines.map((l: any) => (
                  <tr key={l.itemId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{l.item} <span className="muted" style={{ fontWeight: 400 }}>({l.unit})</span>{l.low && <span style={{ marginLeft: 8, color: '#fbbf24', fontSize: 12 }}>● Low</span>}</td>
                    <td style={num}>{l.received}</td><td style={num}>{l.transferIn}</td><td style={num}>{l.transferOut}</td><td style={num}>{l.issued}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{l.remaining}</td>
                    <td style={num}><Minimum w={w} line={l} canEdit={canEdit} onSaved={(m) => { setMsg(m); setTick((n) => n + 1); }} /></td>
                  </tr>))}
                <tr style={{ fontWeight: 700 }}><td style={td}>Total</td><td style={num}>{tot('received')}</td><td style={num}>{tot('transferIn')}</td><td style={num}>{tot('transferOut')}</td><td style={num}>{tot('issued')}</td><td style={num}>{tot('remaining')}</td><td style={td} /></tr>
              </tbody>
            </table></div>
          </div>);
      })}
      <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Collections by farmers</h3>
      <div style={card}>
        {hist.loading && !hist.data ? <TableSkeleton cols={7} /> : !rows.length ? <Empty title="Nothing collected yet" hint="Each handover against a collection code is listed here." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}><th style={th}>When</th><th style={th}>Farmer</th><th style={th}>Hectares</th><th style={th}>Fertiliser</th><th style={{ ...th, textAlign: 'right' }}>Before</th><th style={{ ...th, textAlign: 'right' }}>Issued</th><th style={{ ...th, textAlign: 'right' }}>After</th><th style={th}>Warehouse</th><th style={th}>Keeper</th><th style={th}>Reference</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.at)} {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td style={td}><strong>{r.farmer?.name}</strong><div className="muted" style={{ fontSize: 11.5 }}>{r.farmer?.memberNumber}</div></td>
                <td style={td}>{(r.farmIds ?? []).map(farmId).join(', ') || '—'}</td>
                <td style={td}>{r.item} <span className="muted">({r.unit})</span></td>
                <td style={num}>{r.previous}</td><td style={{ ...num, fontWeight: 700 }}>{r.issued}</td><td style={num}>{r.remaining}</td>
                <td style={td}>{r.warehouse}</td><td style={td}>{r.keeper ?? '—'}</td>
                <td style={td}><div>{r.reference}</div><div className="muted" style={{ fontSize: 11.5 }}>{r.applicationRef}{r.codeEnding ? ` · code …${r.codeEnding}` : ''}</div></td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
    </div>
  );
}
