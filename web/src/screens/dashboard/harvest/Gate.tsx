'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { harvestApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { ConfirmDialog, Empty, Field, LoadError, Notice, TableSkeleton, errMsg, fmtDate, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const clock = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** Type the code from the SMS: see whose plot it is, whether it may be harvested, and mark it harvested. */
export function PassCheck({ onUsed }: { onUsed: () => void }) {
  const can = useCan();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (code.trim().length < 4) return;
    setBusy(true); setMessage(null); setResult(null);
    try { setResult((await harvestApi.lookupPass(code.trim())).data); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'Could not check that code.') }); } finally { setBusy(false); }
  };
  const use = async () => {
    setBusy(true); setMessage(null);
    try {
      const res = (await harvestApi.usePass({ code: result.code })).data;
      setResult(res); setMessage({ tone: 'success', text: `${res.plot} is now marked as being harvested.` }); onUsed();
    } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'This plot cannot be harvested.') }); onUsed(); } finally { setBusy(false); }
  };
  return (
    <section className="table-panel" style={{ padding: 16, marginBottom: 14 }}>
      <strong>Check a pass code</strong>
      <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>The farmer, the block leader and the operator each get this code by SMS when a plot is paid. No code, no harvest.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input-field" style={{ maxWidth: 220, textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 18 }} placeholder="CODE" maxLength={8} autoCapitalize="characters" autoComplete="off"
          value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && check()} aria-label="Pass code" />
        <button type="button" className="btn-primary" disabled={busy || code.trim().length < 4} onClick={check}>Check</button>
      </div>
      {message && <div style={{ marginTop: 10 }}><Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice></div>}
      {result && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 10, border: `2px solid ${result.status === 'USED' ? '#6b7280' : result.cleared ? '#16a34a' : '#dc2626'}` }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'ui-monospace, Menlo, monospace' }}>{result.plot}</div>
          <div>{result.farmer?.name} <span className="muted">· {result.farmer?.memberNumber} · {result.areaHectares} ha</span></div>
          <div style={{ marginTop: 6, fontWeight: 700, color: result.status === 'USED' ? '#4b5563' : result.cleared ? '#15803d' : '#b91c1c' }}>
            {result.status === 'USED' ? `Already harvested (${clock(result.usedAt)})` : result.cleared ? 'Cleared: may be harvested' : `Locked: ${result.reasonText}`}
          </div>
          {result.cleared && can('harvest_passes', 'EDIT') && <button type="button" className="btn-primary" style={{ marginTop: 10 }} disabled={busy} onClick={use}>Mark as harvested</button>}
        </div>
      )}
    </section>
  );
}

function ArrivalDialog({ blockId, blockCode, onClose, onDone }: { blockId: string; blockCode: string; onClose: () => void; onDone: (t: string) => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [machine, setMachine] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { setError('Enter the operator’s name.'); return; }
    setBusy(true); setError('');
    try {
      await harvestApi.logArrival({ blockId, operatorName: name.trim(), operatorPhone: phone.trim() || undefined, machine: machine.trim() || undefined });
      onDone(`${name.trim()} is logged in to block ${farmId(blockCode)}. The block and canal leaders${phone.trim() ? ' and the operator' : ''} have been told.`);
    } catch (e) { setError(errMsg(e, 'Could not log the arrival.')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Combine harvester arrives" subtitle={`Block ${farmId(blockCode)}`} onClose={onClose} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Log arrival'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Operator name *"><input className="input-field" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Operator phone" hint="The operator gets the fee rate and how many plots are cleared, then the pass codes as plots are paid."><input className="input-field" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
        <Field label="Machine"><input className="input-field" maxLength={100} value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="e.g. Kubota DC-70" /></Field>
      </div>
    </Modal>
  );
}

/** Harvesters in the block: log an arrival, and log them out. */
export function Arrivals({ blockId, blockCode, refresh }: { blockId: string; blockCode: string; refresh: number }) {
  const can = useCan();
  const [adding, setAdding] = useState(false);
  const [bump, setBump] = useState(0);
  const [notice, setNotice] = useState('');
  const { data, error, reload } = useApi<any>(blockId ? () => harvestApi.arrivals({ blockId, onSite: 'true' }) : null, [blockId, refresh, bump]);
  const rows: any[] = data?.data ?? [];
  const canLog = can('harvest_passes', 'CREATE');
  return (
    <section className="table-panel" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>Harvesters in this block</strong>
        {canLog && <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>Harvester arrives</button>}
      </div>
      {notice && <div style={{ marginTop: 8 }}><Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice></div>}
      <LoadError message={error} onRetry={reload} />
      {!rows.length ? <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>No combine harvester is logged in to this block.</div> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
          {rows.map((a) => (
            <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
              <span><strong>{a.operatorName}</strong>{a.machine ? ` · ${a.machine}` : ''} <span className="muted">· since {clock(a.arrivedAt)} · {a.plotsHarvested} plot{a.plotsHarvested === 1 ? '' : 's'} harvested</span></span>
              {canLog && <button type="button" className="btn-secondary" onClick={async () => { try { await harvestApi.depart(a.id); setNotice(`${a.operatorName} has left the block.`); setBump((n) => n + 1); } catch (e) { setNotice(errMsg(e, 'Could not log that.')); } }}>Left the block</button>}
            </li>
          ))}
        </ul>
      )}
      {adding && <ArrivalDialog blockId={blockId} blockCode={blockCode} onClose={() => setAdding(false)} onDone={(t) => { setAdding(false); setNotice(t); setBump((n) => n + 1); }} />}
    </section>
  );
}

/** Harvester stopped at a plot, or a dispute: the canal leader settles it. */
export function Incidents({ blocks }: { blocks: any[] }) {
  const can = useCan();
  const [status, setStatus] = useState('OPEN');
  const [refresh, setRefresh] = useState(0);
  const [resolving, setResolving] = useState<any>(null);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => harvestApi.incidents({ status }), [status, refresh]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <select className="input-field" style={{ width: 190 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="ALL">All</option></select>
        {can('harvest_passes', 'CREATE') && <button type="button" className="btn-secondary" onClick={() => setReporting(true)}>Report a dispute</button>}
      </div>
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title={status === 'OPEN' ? 'No open incidents' : 'Nothing here'} hint="When a harvester is refused at an uncleared plot, it is logged here and the canal leader is told." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>When</th><th>Block</th><th>Plot</th><th>What happened</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{clock(i.createdAt)}</td><td>{i.block.code}</td><td>{i.plot ?? '—'}</td>
              <td style={{ maxWidth: 360 }}>{i.description}{i.resolution && <div className="muted" style={{ fontSize: 12 }}>Decided: {i.resolution}</div>}</td>
              <td><span className={`badge ${i.status === 'OPEN' ? 'badge-gold' : 'badge-green'}`}>{i.status === 'OPEN' ? (i.kind === 'DISPUTE' ? 'Dispute' : 'Refused') : 'Resolved'}</span></td>
              <td>{i.status === 'OPEN' && can('harvest_passes', 'EDIT') && <button type="button" className="btn-primary" onClick={() => setResolving(i)}>Resolve</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {resolving && <ConfirmDialog title="Resolve this incident" confirmLabel="Resolve" askReason reasonLabel="What was decided" body={<>This records the decision. It never clears an unpaid plot: that needs the fee paid.</>}
        onConfirm={async (reason) => { await harvestApi.resolveIncident(resolving.id, reason); setNotice('Incident resolved.'); setRefresh((n) => n + 1); }} onClose={() => setResolving(null)} />}
      {reporting && <ReportDialog blocks={blocks} onClose={() => setReporting(false)} onDone={() => { setReporting(false); setNotice('Dispute recorded.'); setRefresh((n) => n + 1); }} />}
    </div>
  );
}

function ReportDialog({ blocks, onClose, onDone }: { blocks: any[]; onClose: () => void; onDone: () => void }) {
  const [blockId, setBlockId] = useState(blocks[0]?.id ?? ''); const [text, setText] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) { setError('Describe what happened.'); return; }
    setBusy(true); setError('');
    try { await harvestApi.reportIncident({ blockId, description: text.trim() }); onDone(); } catch (e) { setError(errMsg(e, 'Could not record it.')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Report a dispute" onClose={onClose} width="480px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>Record</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => setBlockId(e.target.value)}>{blocks.map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>
        <Field label="What happened *"><textarea className="input-field" rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** What was collected on a day, how it divides between operations and maintenance, and the Accountant's sign-off. */
export function Reconciliation() {
  const can = useCan();
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [refresh, setRefresh] = useState(0);
  const [note, setNote] = useState('');
  const [percent, setPercent] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, loading, error, reload } = useApi<any>(() => harvestApi.reconciliation(day), [day, refresh]);
  const act = async (fn: () => Promise<any>, ok: string) => {
    setMessage(null);
    try { await fn(); setMessage({ tone: 'success', text: ok }); setRefresh((n) => n + 1); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'That did not work.') }); }
  };
  return (
    <div>
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Harvest fees are divided into the operating account and the maintenance fund. The Manager sets the share; the Accountant checks each day’s collection and signs it off. This is a record for the Accountant: it does not move money between accounts.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
        <Field label="Day"><input type="date" className="input-field" value={day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} /></Field>
        {can('harvest_fee_approval', 'EDIT') && (
          <Field label={`Maintenance share (%)${data?.maintenancePercent != null ? `, now ${data.maintenancePercent}%` : ''}`}>
            <span style={{ display: 'flex', gap: 6 }}><input className="input-field" style={{ width: 90 }} inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 20" />
              <button type="button" className="btn-secondary" disabled={percent === ''} onClick={() => act(() => harvestApi.setSplit(Number(percent)), 'The split is saved. It applies to days not yet signed off.')}>Save</button></span>
          </Field>
        )}
      </div>
      {loading && !data ? <TableSkeleton cols={3} rows={3} /> : data && (
        <>
          <div className="metric-grid" style={{ marginBottom: 14 }}>
            <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Collected</div><strong style={{ fontSize: 22 }}>{tzs(data.collected)}</strong><div className="muted" style={{ fontSize: 12 }}>{data.payments} payment{data.payments === 1 ? '' : 's'}</div></div>
            <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Operating account</div><strong style={{ fontSize: 22 }}>{data.operating == null ? '—' : tzs(data.operating)}</strong>{data.maintenancePercent != null && <div className="muted" style={{ fontSize: 12 }}>{100 - data.maintenancePercent}%</div>}</div>
            <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Maintenance fund</div><strong style={{ fontSize: 22 }}>{data.maintenance == null ? '—' : tzs(data.maintenance)}</strong>{data.maintenancePercent != null && <div className="muted" style={{ fontSize: 12 }}>{data.maintenancePercent}%</div>}</div>
          </div>
          {data.maintenancePercent == null && <Notice tone="error">The Manager has not set how harvest fees are divided yet.</Notice>}
          {Object.keys(data.byMethod).length > 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{Object.entries(data.byMethod).map(([m, v]) => `${m.replace('_', ' ').toLowerCase()}: ${tzs(v as number)}`).join(' · ')}</div>}
          {data.reconciled ? (
            <Notice tone="success">Signed off on {fmtDate(data.reconciled.at)}: {tzs(data.reconciled.operating)} to operations and {tzs(data.reconciled.maintenance)} to maintenance.{data.reconciled.note ? ` Note: ${data.reconciled.note}` : ''}</Notice>
          ) : can('harvest_fees', 'EDIT') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="input-field" style={{ maxWidth: 340 }} placeholder="Note (optional), e.g. cash counted and banked" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              <button type="button" className="btn-primary" disabled={data.maintenancePercent == null} onClick={() => act(() => harvestApi.reconcile(day, note || undefined), 'The day is signed off.')}>Sign off this day</button>
            </div>
          )}
          {data.waiting.length > 0 && <div style={{ marginTop: 14, fontSize: 13 }}><strong>Days with payments still to sign off:</strong>{' '}{data.waiting.map((d: string) => <button key={d} type="button" className="btn-secondary" style={{ marginRight: 6 }} onClick={() => setDay(d)}>{d}</button>)}</div>}
        </>
      )}
    </div>
  );
}
