'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { maintenanceApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { useAuthStore } from '@/store/auth.store';
import { Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, errMsg, fmtDate, todayISO, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const TARGETS: [string, string][] = [['CANAL', 'Canal'], ['BLOCK', 'Block'], ['GATE', 'Water gate'], ['EQUIPMENT', 'Equipment'], ['OTHER', 'Other']];
const STATE: Record<string, [string, string]> = { OVERDUE: ['badge-red', 'Overdue'], DUE_SOON: ['badge-gold', 'Due soon'], OK: ['badge-green', 'On track'], STOPPED: ['badge-gray', 'Stopped'] };
const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

function NewSchedule({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const st = useApi<any>(() => maintenanceApi.structure(), []);
  const canals: any[] = st.data?.canals ?? []; const blocks: any[] = st.data?.blocks ?? []; const assets: any[] = st.data?.assets ?? [];
  const [title, setTitle] = useState(''); const [target, setTarget] = useState('CANAL'); const [canalId, setCanalId] = useState(''); const [blockId, setBlockId] = useState(''); const [assetId, setAssetId] = useState('');
  const [location, setLocation] = useState(''); const [interval, setIntervalDays] = useState('90'); const [next, setNext] = useState(todayISO()); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const canal = canalId || canals[0]?.id || ''; const block = blockId || blocks[0]?.id || ''; const asset = assetId || assets[0]?.id || '';
  const save = async () => {
    setBusy(true); setError('');
    try {
      await maintenanceApi.create({ title: title.trim(), target, intervalDays: Number(interval), nextDueOn: next, location: location.trim() || undefined,
        ...(target === 'CANAL' || target === 'GATE' ? { canalId: canal } : {}), ...(target === 'BLOCK' ? { blockId: block } : {}), ...(target === 'EQUIPMENT' ? { assetId: asset } : {}) });
      onDone('Schedule saved.');
    } catch (e) { setError(errMsg(e, 'Could not save.')); setBusy(false); }
  };
  return (
    <Modal title="New maintenance schedule" subtitle="A job that must be done again and again." onClose={() => !busy && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || title.trim().length < 3} onClick={save}>Save</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="What is done"><input className="input-field" maxLength={150} placeholder="e.g. Desilt the main canal" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="It is for"><select className="input-field" value={target} onChange={(e) => setTarget(e.target.value)}>{TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {(target === 'CANAL' || target === 'GATE') && <Field label="Canal"><select className="input-field" value={canal} onChange={(e) => setCanalId(e.target.value)}>{canals.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>}
        {target === 'BLOCK' && <Field label="Block"><select className="input-field" value={block} onChange={(e) => setBlockId(e.target.value)}>{blocks.map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>}
        {target === 'EQUIPMENT' && <Field label="Equipment"><select className="input-field" value={asset} onChange={(e) => setAssetId(e.target.value)}>{assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag})</option>)}</select></Field>}
        {(target === 'GATE' || target === 'OTHER') && <Field label="Where exactly" hint={target === 'OTHER' ? 'Required' : 'e.g. Gate 3'}><input className="input-field" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} /></Field>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Repeat every (days)"><input type="number" min={1} className="input-field" value={interval} onChange={(e) => setIntervalDays(e.target.value)} /></Field>
          <Field label="First due"><input type="date" className="input-field" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function DoneModal({ row, onClose, onDone }: { row: any; onClose: () => void; onDone: (m: string) => void }) {
  const [doneOn, setDoneOn] = useState(todayISO()); const [note, setNote] = useState(''); const [cost, setCost] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await maintenanceApi.done(row.id, { doneOn, note: note.trim() || undefined, cost: cost ? Number(cost) : undefined }); onDone('Recorded. The next date has moved forward.'); }
    catch (e) { setError(errMsg(e, 'Could not save.')); setBusy(false); }
  };
  return (
    <Modal title={`Done: ${row.title}`} subtitle={row.where} onClose={() => !busy && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>Record</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Done on"><input type="date" className="input-field" max={todayISO()} value={doneOn} onChange={(e) => setDoneOn(e.target.value)} /></Field>
        <Field label="What was done"><input className="input-field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Cost (TZS)" hint="Optional."><input type="number" min={0} className="input-field" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Recurring maintenance of canals, blocks, water gates and equipment. */
export default function MaintenancePage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const [refresh, setRefresh] = useState(0); const [adding, setAdding] = useState(false); const [doing, setDoing] = useState<any>(null); const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => maintenanceApi.list(), [refresh]);
  if (!can('maintenance_schedule', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the maintenance permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Maintenance" /><Empty title="Maintenance belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  const rows: any[] = data?.data ?? []; const s = data?.summary;
  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Canals, blocks, water gates and equipment: when each job is next due, and the record of every time it was done." />
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {s && <div className="metric-grid" style={{ marginBottom: 14 }}><StatCard label="Overdue" value={s.overdue} tone={s.overdue ? 'warn' : 'good'} /><StatCard label="Due in 7 days" value={s.dueSoon} /><StatCard label="Active schedules" value={s.total} /></div>}
      {can('maintenance_schedule', 'CREATE') && <div style={{ marginBottom: 10 }}><button type="button" className="btn-primary" onClick={() => setAdding(true)}>New schedule</button></div>}
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="No maintenance schedules" hint="Add the jobs that repeat, like desilting a canal or servicing a pump." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Job</th><th>Where</th><th>Every</th><th>Last done</th><th>Next due</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id} style={r.isActive ? undefined : { opacity: 0.55 }}>
              <td><strong>{r.title}</strong>{r.recent[0]?.note && <div className="muted" style={{ fontSize: 11 }}>{r.recent[0].note}{r.recent[0].cost != null ? ` · ${tzs(r.recent[0].cost)}` : ''}</div>}</td>
              <td>{r.where}</td><td>{r.intervalDays} d</td><td>{r.lastDoneOn ? fmtDate(r.lastDoneOn) : '—'}</td>
              <td>{fmtDate(r.nextDueOn)} <span className={`badge ${STATE[r.state][0]}`}>{STATE[r.state][1]}{r.state === 'OVERDUE' ? ` · ${-r.daysLeft} d` : ''}</span></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{can('maintenance_schedule', 'EDIT') && <>
                {r.isActive && <button type="button" className="btn-primary" style={{ marginRight: 6 }} onClick={() => setDoing(r)}>Mark done</button>}
                <button type="button" className="btn-secondary" onClick={async () => { await maintenanceApi.update(r.id, { isActive: !r.isActive }); setRefresh((n) => n + 1); }}>{r.isActive ? 'Stop' : 'Resume'}</button></>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {adding && <NewSchedule onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); setMsg(m); setRefresh((n) => n + 1); }} />}
      {doing && <DoneModal row={doing} onClose={() => setDoing(null)} onDone={(m) => { setDoing(null); setMsg(m); setRefresh((n) => n + 1); }} />}
    </div>
  );
}
