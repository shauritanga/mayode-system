'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { inputDistributionApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { useAuthStore } from '@/store/auth.store';
import { FarmerPicker } from '@/screens/dashboard/dues/page';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, errMsg, fmtDate, todayISO, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

function IssueForm({ items, onClose, onDone }: { items: any[]; onClose: () => void; onDone: (m: string) => void }) {
  const [farmer, setFarmer] = useState<any>(null); const [itemId, setItemId] = useState(items[0]?.id ?? ''); const [qty, setQty] = useState(''); const [price, setPrice] = useState('');
  const [dueDate, setDueDate] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const item = items.find((i) => i.id === itemId);
  const amount = (Number(qty) || 0) * (Number(price) || item?.unitCost || 0);
  const save = async () => {
    if (!farmer) { setError('Choose the farmer.'); return; }
    setBusy(true); setError('');
    try {
      const r: any = await inputDistributionApi.issue({ farmerId: farmer.id, itemId, quantity: Number(qty), unitPrice: price ? Number(price) : undefined, dueDate: dueDate || undefined, note: note.trim() || undefined });
      onDone(`${r.data.reference} issued${r.data.farmIds?.length ? ` for Farm ID ${r.data.farmIds.map(farmId).join(', ')}` : ''}. A code was texted to the farmer: ask them for it to confirm they received the goods.`);
    } catch (e) { setError(errMsg(e, 'Could not issue.')); setBusy(false); }
  };
  return (
    <Modal title="Give inputs to a farmer" subtitle="Stock goes down, the cost is charged to the farmer, and they confirm with a code on their phone." onClose={() => !busy && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !qty || !itemId} onClick={save}>{busy ? 'Saving…' : 'Issue'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Farmer"><FarmerPicker value={farmer} onChange={setFarmer} /></Field>
        <Field label="Input"><select className="input-field" value={itemId} onChange={(e) => setItemId(e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.balance} {i.unit} in stock</option>)}</select></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label={`Quantity${item ? ` (${item.unit})` : ''}`}><input type="number" min={0} step="any" className="input-field" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Price per unit" hint={item?.unitCost ? `Leave empty for ${tzs(item.unitCost)}` : 'Required: this input has no set price'}><input type="number" min={0} className="input-field" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        </div>
        <Field label="Pay by" hint="Optional."><input type="date" className="input-field" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <Field label="Note"><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="muted" style={{ fontSize: 13 }}>Charged to the farmer: <strong>{tzs(amount)}</strong></div>
      </div>
    </Modal>
  );
}

function Issues() {
  const can = useCan();
  const [status, setStatus] = useState('PENDING'); const [refresh, setRefresh] = useState(0); const [adding, setAdding] = useState(false); const [msg, setMsg] = useState(''); const [confirm, setConfirm] = useState<any>(null);
  const stock = useApi<any>(() => inputDistributionApi.items(), [refresh]);
  const { data, loading, error, reload } = useApi<any>(() => inputDistributionApi.list({ status }), [status, refresh]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <select className="input-field" style={{ width: 230 }} aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Waiting for the farmer’s code</option><option value="ACKNOWLEDGED">Confirmed by the farmer</option><option value="ALL">All</option></select>
        {can('input_distribution', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Give inputs to a farmer</button>}
      </div>
      {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="Nothing here" hint="Inputs given to farmers appear here until the farmer confirms with their code." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Reference</th><th>Farmer</th><th>Input</th><th className="num">Amount</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.reference}<div className="muted" style={{ fontSize: 11 }}>{fmtDate(r.issuedAt)}</div></td>
              <td>{r.farmer?.name}<div className="muted" style={{ fontSize: 11 }}>{r.farmer?.memberNumber}{r.farmIds?.length ? ` · Farm ID ${r.farmIds.map(farmId).join(', ')}` : ''}</div></td>
              <td>{r.item} · {r.quantity} {r.unit}</td><td className="num">{tzs(r.amount)}</td>
              <td>{r.ackStatus === 'ACKNOWLEDGED' ? <span className="badge badge-green">Signed {fmtDate(r.ackAt)}</span> : r.locked ? <span className="badge badge-red">Locked</span> : <span className="badge badge-gold">Waiting{r.daysWaiting ? ` · ${r.daysWaiting} d` : ''}</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.ackStatus === 'PENDING' && can('input_distribution', 'EDIT') && <>
                <button type="button" className="btn-secondary" style={{ marginRight: 6 }} onClick={async () => { try { await inputDistributionApi.resend(r.id); setMsg('A new code was texted to the farmer.'); setRefresh((n) => n + 1); } catch (e) { setMsg(errMsg(e)); } }}>New code</button>
                <button type="button" className="btn-primary" disabled={r.locked} onClick={() => setConfirm(r)}>Enter code</button></>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      <h3 style={{ margin: '22px 0 8px' }}>In stock</h3>
      {stock.data && <div className="metric-grid">{(stock.data.data ?? []).map((i: any) => <StatCard key={i.id} label={i.name} value={`${i.balance} ${i.unit}`} tone={i.low ? 'warn' : undefined} hint={i.unitCost ? `${tzs(i.unitCost)} per ${i.unit}` : 'No price set'} />)}</div>}
      {adding && stock.data && <IssueForm items={stock.data.data ?? []} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); setMsg(m); setRefresh((n) => n + 1); }} />}
      {confirm && <ConfirmDialog title={`Confirm ${confirm.reference}`} askReason reasonLabel="The 6-digit code from the farmer" confirmLabel="Confirm receipt"
        body={<>Ask {confirm.farmer?.name} for the code texted to their phone. It is their signature that they received {confirm.quantity} {confirm.unit} of {confirm.item}.</>}
        onConfirm={async (code) => { await inputDistributionApi.acknowledge(confirm.id, code.trim()); setMsg('Signed for by the farmer.'); setRefresh((n) => n + 1); }} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/** Procurement Officer: inputs handed to farmers, confirmed by the farmer's code. */
export default function InputsPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  if (!can('input_distribution', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the input distribution permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Input Distribution" /><Empty title="Inputs belong to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  return (
    <div>
      <PageHeader title="Input Distribution" subtitle="Fertiliser, seed and chemicals given to farmers on credit. Each one is tied to the farmer’s Farm ID and signed for with a code sent to their phone." />
      <Issues />
    </div>
  );
}
