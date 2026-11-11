'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { inputDistributionApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { useAuthStore } from '@/store/auth.store';
import { FarmerPicker } from '@/screens/dashboard/dues/page';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, Tabs, errMsg, fmtDate, todayISO, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const card: React.CSSProperties = { background: 'var(--bg-elevated, rgba(127,127,127,.08))', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' };
const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 16px', alignItems: 'start' };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted, #94a3b8)', padding: '8px 14px', whiteSpace: 'nowrap' };
const initials = (n?: string) => (n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const pill = (tone: 'good' | 'warn' | 'bad'): React.CSSProperties => ({ background: { good: 'rgba(74,222,128,.14)', warn: 'rgba(251,191,36,.14)', bad: 'rgba(248,113,113,.14)' }[tone], color: { good: 'var(--green-400, #4ade80)', warn: '#fbbf24', bad: 'var(--red-400, #f87171)' }[tone], padding: '2px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600 });

/** The "Give Inputs" dialog: pick the farmer and the input, see the stock and the charge before confirming. */
function IssueModal({ items, onClose, onDone, canSetup }: { items: any[]; onClose: () => void; onDone: (m: string) => void; canSetup: boolean }) {
  const [farmer, setFarmer] = useState<any>(null); const [itemId, setItemId] = useState(''); const [qty, setQty] = useState(''); const [price, setPrice] = useState('');
  const [dueDate, setDueDate] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const item = items.find((i) => i.id === itemId);
  const unitPrice = Number(price) || item?.unitCost || 0;
  const amount = (Number(qty) || 0) * unitPrice;
  const left = item ? Math.round((item.balance - (Number(qty) || 0)) * 1000) / 1000 : 0;
  const tooMuch = !!item && (Number(qty) || 0) > item.balance;
  const canSave = !!farmer && !!item && Number(qty) > 0 && unitPrice > 0 && !tooMuch && !busy;
  const groups = items.reduce<Record<string, any[]>>((g, i) => { (g[i.typeName ?? 'Other'] ??= []).push(i); return g; }, {});
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r: any = await inputDistributionApi.issue({ farmerId: farmer.id, itemId, quantity: Number(qty), unitPrice: price ? Number(price) : undefined, dueDate: dueDate || undefined, note: note.trim() || undefined });
      onDone(`${r.data.reference} issued${r.data.farmIds?.length ? ` for Farm ID ${r.data.farmIds.map(farmId).join(', ')}` : ''}. A code was texted to the farmer: ask them for it to confirm they received the goods.`);
      onClose();
    } catch (e) { setError(errMsg(e, 'Could not issue.')); setBusy(false); }
  };
  return (
    <Modal title="Give Inputs" subtitle="Stock goes down, the cost is charged to the farmer, and they confirm with a code on their phone." width="600px" onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="issue-form" className="btn-primary" disabled={!canSave}>{busy ? 'Processing…' : 'Confirm & Send Code'}</button></>}>
      <form id="issue-form" onSubmit={(e) => { e.preventDefault(); if (canSave) void save(); }} noValidate>
        {error && <div role="alert" style={{ marginBottom: 12, background: 'rgba(248,113,113,.12)', border: '1px solid var(--red-400, #f87171)', color: 'var(--red-400, #f87171)', borderRadius: 9, padding: '9px 11px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
        {items.length === 0 && (
          <div style={{ ...card, marginBottom: 14, borderColor: '#fbbf24' }}>
            <strong>No inputs are set up yet.</strong>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{canSetup ? <>Add the inputs you give farmers, and their stock, in <Link href="/dashboard/amcos-settings/farm-inputs">Settings → Farm inputs</Link>.</> : 'Ask an administrator to add them in Settings → Farm inputs.'}</div>
          </div>
        )}
        <div style={row2}>
          <Field label="Farmer *"><FarmerPicker value={farmer} onChange={setFarmer} /></Field>
          <Field label="Input *" hint={items.length ? 'Grouped by type, with what is in stock' : undefined}>
            <select className="input-field" value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={!items.length}>
              <option value="">{items.length ? 'Choose the input…' : 'No inputs set up'}</option>
              {Object.entries(groups).map(([type, list]) => <optgroup key={type} label={type}>{list.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.balance} {i.unit} in stock</option>)}</optgroup>)}
            </select>
          </Field>
        </div>
        {item && (
          <div style={{ ...card, marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
            <div><div style={{ fontWeight: 700 }}>{item.name}</div><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{item.typeName}</div></div>
            <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 11 }}>In stock</div><div style={{ fontSize: 18, fontWeight: 700, color: item.low ? '#fbbf24' : undefined }}>{item.balance} {item.unit}</div>{item.unitCost ? <div className="muted" style={{ fontSize: 12 }}>{tzs(item.unitCost)} per {item.unit}</div> : <div style={{ fontSize: 12, color: '#fbbf24' }}>No set price</div>}</div>
          </div>
        )}
        <div style={{ ...row2, marginTop: 14 }}>
          <Field label={`Quantity${item ? ` (${item.unit})` : ''} *`}><input type="number" min={0} step="any" className="input-field" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Enter quantity" /></Field>
          <Field label="Price per unit (TZS)" hint={item?.unitCost ? `Leave empty for ${tzs(item.unitCost)}` : item ? 'Required: this input has no set price' : undefined}><input type="number" min={0} className="input-field" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Pay by" hint="Optional."><input type="date" className="input-field" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Note"><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        </div>
        {item && Number(qty) > 0 && (
          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Quantity</span><span>{qty} {item.unit}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Charged to the farmer</span><strong>{tzs(amount)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Stock after</span><span style={{ color: tooMuch ? 'var(--red-400)' : undefined }}>{left} {item.unit}</span></div>
            </div>
            <div style={{ marginTop: 10, borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, background: tooMuch || unitPrice <= 0 ? 'rgba(248,113,113,.12)' : 'rgba(74,222,128,.12)', color: tooMuch || unitPrice <= 0 ? 'var(--red-400, #f87171)' : 'var(--green-400, #4ade80)' }}>
              {tooMuch ? `Only ${item.balance} ${item.unit} is in stock` : unitPrice <= 0 ? 'Enter a price per unit' : '✓ Confirming gives the goods, charges the farmer, and texts them a code to sign for it'}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function Issues({ canSetup }: { canSetup: boolean }) {
  const can = useCan();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'ACKNOWLEDGED'>('ALL'); const [search, setSearch] = useState(''); const [refresh, setRefresh] = useState(0);
  const [adding, setAdding] = useState(false); const [msg, setMsg] = useState(''); const [confirm, setConfirm] = useState<any>(null);
  const stock = useApi<any>(() => inputDistributionApi.items(), [refresh]);
  const { data, loading, error, reload } = useApi<any>(() => inputDistributionApi.list({ status: 'ALL' }), [refresh]);
  const all: any[] = data?.data ?? [];
  const count = (k: string) => (k === 'ALL' ? all.length : all.filter((r) => r.ackStatus === k).length);
  const q = search.trim().toLowerCase();
  const rows = all.filter((r) => (filter === 'ALL' || r.ackStatus === filter) && (!q || `${r.reference} ${r.farmer?.name ?? ''} ${r.farmer?.memberNumber ?? ''} ${r.item} ${(r.farmIds ?? []).join(' ')}`.toLowerCase().includes(q)));
  const sum = (list: any[]) => list.reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const fpill = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? 'var(--accent, #34d399)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-dim, rgba(52,211,153,.14))' : 'transparent', color: 'inherit', borderRadius: 999, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 500 });
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div className="metric-grid" style={{ marginBottom: 14 }}>
        <StatCard label="Given out" value={String(all.length)} />
        <StatCard label="Charged to farmers" value={tzs(sum(all))} />
        <StatCard label="Waiting for the farmer’s code" value={String(count('PENDING'))} tone={count('PENDING') ? 'warn' : 'good'} hint={count('PENDING') ? tzs(sum(all.filter((r) => r.ackStatus === 'PENDING'))) : undefined} />
        <StatCard label="Signed for" value={String(count('ACKNOWLEDGED'))} tone="good" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['ALL', 'All'], ['PENDING', 'Waiting for code'], ['ACKNOWLEDGED', 'Signed']] as const).map(([k, label]) => (
            <button key={k} type="button" style={fpill(filter === k)} onClick={() => setFilter(k)}>{label} <span className="muted" style={{ marginLeft: 4 }}>{count(k)}</span></button>))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input-field" style={{ width: 220 }} placeholder="Search issues…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {can('input_distribution', 'CREATE') && <button type="button" className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setAdding(true)}>+ Give Inputs</button>}
        </div>
      </div>
      <div className="table-panel" style={{ overflow: 'hidden' }}>
        {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            {all.length ? 'No issues match.' : 'No inputs have been given to farmers yet.'}
            {!all.length && can('input_distribution', 'CREATE') && <div style={{ marginTop: 12 }}><button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ Give the first inputs</button></div>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}><th style={{ ...th, paddingLeft: 20 }}>Farmer</th><th style={th}>Farm ID</th><th style={th}>Input</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Status</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 14px', paddingLeft: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(52,211,153,.18)', color: 'var(--accent, #34d399)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{initials(r.farmer?.name)}</div>
                      <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.farmer?.name ?? '—'}</div><div className="muted" style={{ fontSize: 11.5 }}>{r.reference} · {fmtDate(r.issuedAt)}</div></div>
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 600, fontSize: 13.5 }}>{r.farmIds?.length ? r.farmIds.map(farmId).join(', ') : '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5 }}>{r.item}<div className="muted" style={{ fontSize: 11.5 }}>{r.quantity} {r.unit}</div></td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{tzs(r.amount)}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {r.ackStatus === 'ACKNOWLEDGED' ? <><span style={pill('good')}>Signed</span><div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{fmtDate(r.ackAt)}</div></>
                      : r.locked ? <span style={pill('bad')}>Locked</span> : <span style={pill('warn')}>Waiting{r.daysWaiting ? ` · ${r.daysWaiting} d` : ''}</span>}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.ackStatus === 'PENDING' && can('input_distribution', 'EDIT') && <>
                    <button type="button" className="btn-secondary" style={{ marginRight: 6 }} onClick={async () => { try { await inputDistributionApi.resend(r.id); setMsg('A new code was texted to the farmer.'); setRefresh((n) => n + 1); } catch (e) { setMsg(errMsg(e, 'Could not send the code.')); } }}>Resend code</button>
                    <button type="button" className="btn-primary" disabled={r.locked} onClick={() => setConfirm(r)}>Enter code</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {adding && stock.data && <IssueModal items={stock.data.data ?? []} canSetup={canSetup} onClose={() => setAdding(false)} onDone={(m) => { setMsg(m); setRefresh((n) => n + 1); }} />}
      {confirm && <ConfirmDialog title={`Confirm ${confirm.reference}`} askReason reasonLabel="The 6-digit code from the farmer" confirmLabel="Confirm receipt"
        body={<>Ask {confirm.farmer?.name} for the code texted to their phone. It is their signature that they received {confirm.quantity} {confirm.unit} of {confirm.item}.</>}
        onConfirm={async (code) => { await inputDistributionApi.acknowledge(confirm.id, code.trim()); setMsg('Signed for by the farmer.'); setRefresh((n) => n + 1); }} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function Stock({ canSetup }: { canSetup: boolean }) {
  const stock = useApi<any>(() => inputDistributionApi.items(), []);
  const list: any[] = stock.data?.data ?? [];
  return (
    <div>
      <LoadError message={stock.error} onRetry={stock.reload} />
      <div className="table-panel" style={{ overflow: 'hidden' }}>
        {stock.loading && !stock.data ? <TableSkeleton cols={5} /> : !list.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            No inputs are set up yet.
            <div style={{ marginTop: 6 }}>{canSetup ? <Link href="/dashboard/amcos-settings/farm-inputs">Add inputs and stock in Settings → Farm inputs</Link> : 'Ask an administrator to add them in Settings → Farm inputs.'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}><th style={{ ...th, paddingLeft: 20 }}>Input</th><th style={th}>Type</th><th style={{ ...th, textAlign: 'right' }}>Price</th><th style={{ ...th, textAlign: 'right' }}>In stock</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 14px', paddingLeft: 20, fontWeight: 600 }}>{i.name}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>{i.typeName}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>{i.unitCost ? `${tzs(i.unitCost)} / ${i.unit}` : '—'}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700 }}>{i.balance} {i.unit}</td>
                  <td style={{ padding: '11px 14px' }}>{i.low ? <span style={pill('warn')}>Running low</span> : <span style={pill('good')}>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {canSetup && <p className="muted" style={{ fontSize: 13 }}>Add new inputs, change prices and receive stock in <Link href="/dashboard/amcos-settings/farm-inputs">Settings → Farm inputs</Link>.</p>}
    </div>
  );
}

/** Procurement Officer: inputs handed to farmers, confirmed by the farmer's code. */
export default function InputsPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const [tab, setTab] = useState<'issues' | 'stock'>('issues');
  if (!can('input_distribution', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the input distribution permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Input Distribution" /><Empty title="Inputs belong to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  const canSetup = can('amcos_settings', 'EDIT');
  return (
    <div>
      <PageHeader title="Input Distribution" subtitle="Fertiliser, seed and chemicals given to farmers on credit. Each one is tied to the farmer’s Farm ID and signed for with a code sent to their phone." />
      <Tabs tabs={[{ id: 'issues', label: 'Given to farmers' }, { id: 'stock', label: 'In stock' }]} active={tab} onChange={(v) => setTab(v as 'issues' | 'stock')} />
      <div style={{ marginTop: 14 }} key={tab}>{tab === 'issues' ? <Issues canSetup={canSetup} /> : <Stock canSetup={canSetup} />}</div>
    </div>
  );
}
