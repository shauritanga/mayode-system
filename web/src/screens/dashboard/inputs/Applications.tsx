'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { inputApplicationsApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { Empty, LoadError, Notice, TableSkeleton, errMsg, fmtDate, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted, #94a3b8)', padding: '8px 14px', whiteSpace: 'nowrap' };
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  SUBMITTED: { label: 'Waiting for you', color: '#fbbf24', bg: 'rgba(251,191,36,.14)' },
  PROCESSING: { label: 'Being approved', color: '#fbbf24', bg: 'rgba(251,191,36,.14)' },
  PARTLY_ISSUED: { label: 'Partly given', color: '#fbbf24', bg: 'rgba(251,191,36,.14)' },
  APPROVED: { label: 'Approved and given', color: 'var(--green-400, #4ade80)', bg: 'rgba(74,222,128,.14)' },
  REJECTED: { label: 'Not approved', color: 'var(--red-400, #f87171)', bg: 'rgba(248,113,113,.14)' },
  WITHDRAWN: { label: 'Withdrawn by farmer', color: 'var(--text-muted, #94a3b8)', bg: 'rgba(148,163,184,.14)' },
};
const FILTERS: [string, string][] = [['OPEN', 'To handle'], ['APPROVED', 'Approved'], ['REJECTED', 'Not approved'], ['ALL', 'All']];

function Review({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: (m: string) => void }) {
  const can = useCan();
  const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const open = app.status === 'SUBMITTED' || app.status === 'PARTLY_ISSUED';
  const run = async (fn: () => Promise<any>, done: string) => {
    setBusy(true); setError('');
    try { await fn(); onDone(done); onClose(); } catch (e) { setError(errMsg(e, 'Could not do that.')); setBusy(false); }
  };
  return (
    <Modal title={`Application ${app.reference}`} subtitle={`${app.farmer?.name ?? 'Farmer'} · sent from the app on ${fmtDate(app.submittedAt)}`} width="600px" onClose={() => !busy && onClose()}
      footer={open ? (rejecting
        ? <><button type="button" className="btn-secondary" onClick={() => setRejecting(false)} disabled={busy}>Back</button>
            <button type="button" className="btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => run(() => inputApplicationsApi.reject(app.id, reason), 'Application not approved. The farmer was told.')}>{busy ? 'Working…' : 'Confirm: not approved'}</button></>
        : <><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Close</button>
            {can('input_distribution', 'EDIT') && app.status === 'SUBMITTED' && <button type="button" className="btn-secondary" onClick={() => setRejecting(true)} disabled={busy}>Do not approve</button>}
            {can('input_distribution', 'CREATE') && <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => inputApplicationsApi.approve(app.id), 'Approved. The inputs were given, charged to the farmer, and a code was texted to them.')}>{busy ? 'Giving out…' : 'Approve and give inputs'}</button>}</>)
        : <button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      {error && <div role="alert" style={{ marginBottom: 12, background: 'rgba(248,113,113,.12)', border: '1px solid var(--red-400, #f87171)', color: 'var(--red-400, #f87171)', borderRadius: 9, padding: '9px 11px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{app.farmer?.memberNumber ? `Member ${app.farmer.memberNumber}` : ''}{app.farmer?.phone ? ` · ${app.farmer.phone}` : ''}</div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted, #94a3b8)', marginBottom: 6 }}>Hectares</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>{app.farmIds.map((f: string) => <span key={f} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '3px 10px', fontSize: 13 }}>Farm ID {farmId(f)}</span>)}</div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted, #94a3b8)', marginBottom: 6 }}>Inputs asked for</div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
        {app.lines.map((l: any) => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 14 }}>
            <span><strong>{l.item}</strong> · {l.quantity} {l.unit}{l.given && <span style={{ color: 'var(--green-400, #4ade80)', marginLeft: 8, fontSize: 12 }}>✓ given</span>}</span>
            <span className="muted">{tzs(l.amount)}</span>
          </div>))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontWeight: 700 }}><span>Estimated charge</span><span>{tzs(app.estimatedTotal)}</span></div>
      </div>
      {app.note && <p style={{ fontSize: 13, marginTop: 12 }}><span className="muted">Farmer’s note: </span>{app.note}</p>}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>The farmer accepted the terms and conditions on {fmtDate(app.consentAt)}. The final price is the one on the stock list on the day the inputs are given.</p>
      {app.status === 'REJECTED' && <p style={{ fontSize: 13, marginTop: 8 }}><span className="muted">Reason given: </span>{app.rejectReason}</p>}
      {rejecting && <div style={{ marginTop: 14 }}><label style={{ fontSize: 13, fontWeight: 600 }}>Why is it not approved? The farmer will be texted this.</label><input className="input-field" style={{ marginTop: 6 }} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: this input is out of stock" autoFocus /></div>}
    </Modal>
  );
}

/** Applications farmers made in the mobile app. Approving one gives the inputs out through the normal Input Distribution flow. */
export function InputApplications({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState('OPEN'); const [refresh, setRefresh] = useState(0); const [msg, setMsg] = useState(''); const [viewing, setViewing] = useState<any>(null);
  const { data, loading, error, reload } = useApi<any>(() => inputApplicationsApi.list({ status: filter }), [filter, refresh]);
  const rows: any[] = data?.data ?? [];
  const fpill = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? 'var(--accent, #34d399)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-dim, rgba(52,211,153,.14))' : 'transparent', color: 'inherit', borderRadius: 999, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 500 });
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Farmers who applied for inputs from their phone. Approving gives the inputs out exactly as if you had used “Give Inputs” at the office.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{FILTERS.map(([k, label]) => <button key={k} type="button" style={fpill(filter === k)} onClick={() => setFilter(k)}>{label}</button>)}</div>
      <div className="table-panel" style={{ overflow: 'hidden' }}>
        {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title={filter === 'OPEN' ? 'No applications waiting' : 'No applications here'} hint="Applications farmers send from the app appear here." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}><th style={{ ...th, paddingLeft: 20 }}>Farmer</th><th style={th}>Hectares</th><th style={th}>Inputs asked for</th><th style={{ ...th, textAlign: 'right' }}>Estimate</th><th style={th}>Status</th><th style={th} /></tr></thead>
            <tbody>{rows.map((r) => { const st = STATUS[r.status] ?? STATUS.SUBMITTED; return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setViewing(r)}>
                <td style={{ padding: '11px 14px', paddingLeft: 20 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.farmer?.name ?? '—'}</div><div className="muted" style={{ fontSize: 11.5 }}>{r.reference} · {fmtDate(r.submittedAt)}</div></td>
                <td style={{ padding: '11px 14px', fontSize: 13 }}>{r.farmIds.map(farmId).join(', ')}</td>
                <td style={{ padding: '11px 14px', fontSize: 13 }}>{r.lines.map((l: any) => `${l.item} ${l.quantity} ${l.unit}`).join(', ')}</td>
                <td style={{ padding: '11px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{tzs(r.estimatedTotal)}</td>
                <td style={{ padding: '11px 14px' }}><span style={{ background: st.bg, color: st.color, padding: '2px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{st.label}</span></td>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}><button type="button" className="btn-secondary" onClick={(e) => { e.stopPropagation(); setViewing(r); }}>{r.status === 'SUBMITTED' || r.status === 'PARTLY_ISSUED' ? 'Review' : 'View'}</button></td>
              </tr>); })}</tbody>
          </table></div>)}
      </div>
      {viewing && <Review app={viewing} onClose={() => setViewing(null)} onDone={(m) => { setMsg(m); setRefresh((n) => n + 1); onChanged(); }} />}
    </div>
  );
}
