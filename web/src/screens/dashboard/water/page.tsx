'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { waterApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, Tabs, errMsg, fmtDate, todayISO, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ISSUES: [string, string][] = [['LEAK', 'Leak'], ['SHORTAGE', 'Water shortage'], ['DISPUTE', 'Dispute over turns'], ['BLOCKAGE', 'Blockage'], ['OTHER', 'Other']];
const issueLabel = (t: string) => ISSUES.find(([v]) => v === t)?.[1] ?? t;
const time = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const localTime = (hhmm: string, date: string) => (hhmm ? new Date(`${date}T${hhmm}:00`).toISOString() : undefined);

function LogForm({ structure, onDone }: { structure: any; onDone: (t: string) => void }) {
  const blocks: any[] = structure?.blocks ?? []; const canals: any[] = structure?.canals ?? []; const openers: any[] = structure?.gateOpeners ?? [];
  const [canalId, setCanalId] = useState(''); const [blockId, setBlockId] = useState(''); const [date, setDate] = useState(todayISO());
  const [opened, setOpened] = useState(''); const [closed, setClosed] = useState(''); const [opener, setOpener] = useState(''); const [note, setNote] = useState('');
  const [issueType, setIssueType] = useState(''); const [issueNote, setIssueNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const canal = canalId || canals[0]?.id || '';
  const mine = blocks.filter((b) => b.canalId === canal);
  const save = async () => {
    if (issueType && !issueNote.trim()) { setError('Describe the water issue.'); return; }
    setBusy(true); setError('');
    try {
      await waterApi.log({ canalId: canal, blockId: blockId || undefined, date, openedAt: localTime(opened, date), closedAt: localTime(closed, date), gateOpenerPayeeId: opener || undefined, note: note.trim() || undefined, ...(issueType ? { issueType, issueNote: issueNote.trim() } : {}) });
      setNote(''); setIssueType(''); setIssueNote(''); setOpened(''); setClosed('');
      onDone(issueType ? 'Logged, with the water issue.' : 'Water logged.');
    } catch (e) { setError(errMsg(e, 'Could not save the log.')); } finally { setBusy(false); }
  };
  return (
    <section className="table-panel" style={{ padding: 16, marginBottom: 14 }}>
      <strong>Log the water</strong>
      <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>Who opened the gate and when, and anything that went wrong. Gate opener and chairman stipends are checked against these entries.</div>
      {error && <Notice tone="error">{error}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Canal"><select className="input-field" value={canal} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); }}>{canals.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
        <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => setBlockId(e.target.value)}><option value="">Whole canal</option>{mine.map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>
        <Field label="Day"><input type="date" className="input-field" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Gate opened"><input type="time" className="input-field" value={opened} onChange={(e) => setOpened(e.target.value)} /></Field>
        <Field label="Gate closed"><input type="time" className="input-field" value={closed} onChange={(e) => setClosed(e.target.value)} /></Field>
        <Field label="Gate opener on duty"><select className="input-field" value={opener} onChange={(e) => setOpener(e.target.value)}><option value="">None / not recorded</option>{openers.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.workerCode}</option>)}</select></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
        <Field label="Note"><input className="input-field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Water issue"><select className="input-field" value={issueType} onChange={(e) => setIssueType(e.target.value)}><option value="">No issue</option>{ISSUES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {issueType && <Field label="What happened *"><input className="input-field" maxLength={1000} value={issueNote} onChange={(e) => setIssueNote(e.target.value)} /></Field>}
      </div>
      <div style={{ marginTop: 12 }}><button type="button" className="btn-primary" disabled={busy || !canal} onClick={save}>{busy ? 'Saving…' : 'Save the log'}</button></div>
    </section>
  );
}

function Today({ onChanged }: { onChanged: () => void }) {
  const can = useCan();
  const o = useApi<any>(() => waterApi.overview(), []);
  const structure = useApi<any>(() => waterApi.structure(), []);
  const [msg, setMsg] = useState('');
  const t = o.data?.totals;
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={o.error} onRetry={o.reload} />
      {t && <div className="metric-grid" style={{ marginBottom: 14 }}>
        <StatCard label="Canals scheduled today" value={t.scheduledToday} />
        <StatCard label="Logged today" value={`${t.loggedToday} / ${t.scheduledToday}`} tone={t.loggedToday < t.scheduledToday ? 'warn' : 'good'} hint={t.loggedToday < t.scheduledToday ? 'Some scheduled canals have no log yet' : undefined} />
        <StatCard label="Open water issues" value={t.openIssues} tone={t.openIssues ? 'warn' : 'good'} />
      </div>}
      {can('water', 'CREATE') && <LogForm structure={structure.data} onDone={(m) => { setMsg(m); o.reload(); onChanged(); }} />}
      <section className="table-panel">
        <div className="section-toolbar"><strong>Canals today · {o.data ? fmtDate(o.data.date) : ''}</strong></div>
        {o.loading && !o.data ? <TableSkeleton cols={4} rows={3} /> : !o.data?.canals.length ? <Empty title="No canals" /> : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Canal</th><th>Status</th><th>Today</th><th className="num">Open issues</th></tr></thead><tbody>
            {o.data.canals.map((c: any) => <tr key={c.id}><td><strong>{c.code}</strong> <span className="muted">{c.name}</span></td><td><span className={`badge ${c.status === 'ACTIVE' ? 'badge-green' : 'badge-gold'}`}>{c.status === 'UNDER_MAINTENANCE' ? 'Under maintenance' : c.status.toLowerCase()}</span></td>
              <td>{!c.scheduledToday ? <span className="muted">Not scheduled</span> : c.loggedToday ? <span className="badge badge-green">Logged</span> : <span className="badge badge-red">Not logged yet</span>}</td><td className="num">{c.openIssues || '—'}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}

function Log() {
  const can = useCan();
  const [filter, setFilter] = useState('all'); const [refresh, setRefresh] = useState(0); const [resolving, setResolving] = useState<any>(null); const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => waterApi.logs(filter === 'open' ? { issues: 'open' } : filter === 'issues' ? { issues: 'all' } : {}), [filter, refresh]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ marginBottom: 10 }}><select className="input-field" style={{ width: 230 }} aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">The last two weeks</option><option value="open">Open water issues</option><option value="issues">All water issues</option></select></div>
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="Nothing logged" hint="Chairmen, gate openers’ supervisors and field officers log the water here." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Day</th><th>Where</th><th>Gate</th><th>Logged by</th><th>Issue</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.date)}</td><td>{r.canal}{r.block ? ` · ${farmId(r.block)}` : ''}</td>
              <td style={{ fontSize: 12.5 }}>{r.gateOpener ?? <span className="muted">—</span>}{r.openedAt && <div className="muted">opened {time(r.openedAt)}{r.closedAt ? `, closed ${time(r.closedAt)}` : ''}</div>}{r.note && <div className="muted">{r.note}</div>}</td>
              <td>{r.loggedBy}</td>
              <td>{r.issue ? <><span className={`badge ${r.issue.status === 'OPEN' ? 'badge-red' : 'badge-green'}`}>{issueLabel(r.issue.type)}{r.issue.status === 'RESOLVED' ? ' · resolved' : ''}</span><div style={{ fontSize: 12.5 }}>{r.issue.note}</div>{r.issue.resolution && <div className="muted" style={{ fontSize: 12 }}>Decided: {r.issue.resolution}</div>}</> : <span className="muted">—</span>}</td>
              <td style={{ textAlign: 'right' }}>{r.issue?.status === 'OPEN' && can('water', 'EDIT') && <button type="button" className="btn-primary" onClick={() => setResolving(r)}>Resolve</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {resolving && <ConfirmDialog title="Resolve this water issue" askReason reasonLabel="What was done" confirmLabel="Resolve" body={<>{issueLabel(resolving.issue.type)} at {resolving.canal}{resolving.block ? ` · ${farmId(resolving.block)}` : ''}: {resolving.issue.note}</>}
        onConfirm={async (reason) => { await waterApi.resolve(resolving.id, reason); setMsg('Issue resolved.'); setRefresh((n) => n + 1); }} onClose={() => setResolving(null)} />}
    </div>
  );
}

function ScheduleForm({ structure, onClose, onDone }: { structure: any; onClose: () => void; onDone: (t: string) => void }) {
  const canals: any[] = structure?.canals ?? []; const blocks: any[] = structure?.blocks ?? []; const openers: any[] = structure?.gateOpeners ?? [];
  const [canalId, setCanalId] = useState(''); const [blockId, setBlockId] = useState(''); const [days, setDays] = useState<number[]>([1, 3, 5]); const [opener, setOpener] = useState('');
  const [startsOn, setStartsOn] = useState(todayISO()); const [endsOn, setEndsOn] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const canal = canalId || canals[0]?.id || '';
  const save = async () => {
    if (!days.length) { setError('Choose the days water runs.'); return; }
    setBusy(true); setError('');
    try { await waterApi.createSchedule({ canalId: canal, blockId: blockId || undefined, weekdays: days, startsOn, endsOn: endsOn || undefined, gateOpenerPayeeId: opener || undefined, note: note.trim() || undefined }); onDone('Schedule saved.'); }
    catch (e) { setError(errMsg(e, 'Could not save.')); setBusy(false); }
  };
  return (
    <Modal title="Water schedule" subtitle="When water is to run, and who opens the gate." onClose={() => !busy && onClose()} width="560px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Canal"><select className="input-field" value={canal} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); }}>{canals.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => setBlockId(e.target.value)}><option value="">Whole canal</option>{blocks.filter((b) => b.canalId === canal).map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>
        </div>
        <Field label="Days water runs"><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DAYS.map((d, i) => <label key={d} className={`badge ${days.includes(i) ? 'badge-green' : 'badge-gray'}`} style={{ cursor: 'pointer', padding: '6px 10px' }}><input type="checkbox" style={{ display: 'none' }} checked={days.includes(i)} onChange={(e) => setDays((p) => (e.target.checked ? [...p, i] : p.filter((x) => x !== i)))} />{d}</label>)}</div></Field>
        <Field label="Gate opener" hint="Their stipend is checked against the days they log."><select className="input-field" value={opener} onChange={(e) => setOpener(e.target.value)}><option value="">None assigned</option>{openers.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.workerCode}</option>)}</select></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Starts"><input type="date" className="input-field" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
          <Field label="Ends" hint="Leave empty for no end."><input type="date" className="input-field" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
        </div>
        <Field label="Note"><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Schedules() {
  const can = useCan();
  const [refresh, setRefresh] = useState(0); const [adding, setAdding] = useState(false); const [msg, setMsg] = useState('');
  const sched = useApi<any>(() => waterApi.schedules(), [refresh]);
  const structure = useApi<any>(() => waterApi.structure(), []);
  const rows: any[] = sched.data?.data ?? [];
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={sched.error} onRetry={sched.reload} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>The rotation: which days water runs on each canal or block, and who is responsible. Stipends are checked against it.</p>
        {can('water_schedules', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>New schedule</button>}
      </div>
      {sched.loading && !sched.data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="No schedules yet" hint="Without a schedule there is nothing to check a gate opener's or chairman's stipend against." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Where</th><th>Days</th><th>Gate opener</th><th>Period</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id} style={r.isActive ? undefined : { opacity: 0.55 }}>
              <td>{r.canal.code}{r.block ? ` · ${farmId(r.block.code)}` : ' · whole canal'}{r.note && <div className="muted" style={{ fontSize: 11 }}>{r.note}</div>}</td>
              <td>{r.weekdays.map((d: number) => DAYS[d]).join(', ')}</td><td>{r.gateOpener?.name ?? <span className="muted">—</span>}</td>
              <td style={{ fontSize: 12.5 }}>{fmtDate(r.startsOn)} – {r.endsOn ? fmtDate(r.endsOn) : 'open'}</td>
              <td style={{ textAlign: 'right' }}>{can('water_schedules', 'EDIT') && <button type="button" className="btn-secondary" onClick={async () => { await waterApi.updateSchedule(r.id, { isActive: !r.isActive }); setRefresh((n) => n + 1); }}>{r.isActive ? 'Stop' : 'Resume'}</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {adding && <ScheduleForm structure={structure.data} onClose={() => setAdding(false)} onDone={(t) => { setAdding(false); setMsg(t); setRefresh((n) => n + 1); }} />}
    </div>
  );
}

type Tab = 'today' | 'log' | 'schedules';

/** Water and gates: today's rotation, the daily log and water issues, and the schedules gate opener and chairman stipends are checked against. */
export default function WaterPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const [tab, setTab] = useState<Tab>('today'); const [bump, setBump] = useState(0);
  if (!can('water', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the water permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Water & Gates" /><Empty title="Water belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  return (
    <div>
      <PageHeader title="Water & Gates" subtitle="The water rotation, what was logged at the gates, and water issues. Gate opener and chairman stipends are paid against this record." />
      <Tabs tabs={[{ id: 'today' as Tab, label: 'Today' }, { id: 'log' as Tab, label: 'Log & issues' }, ...(can('water_schedules', 'VIEW') ? [{ id: 'schedules' as Tab, label: 'Schedules' }] : [])]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }} key={`${tab}-${bump}`}>
        {tab === 'today' && <Today onChanged={() => setBump((n) => n)} />}
        {tab === 'log' && <Log />}
        {tab === 'schedules' && <Schedules />}
      </div>
    </div>
  );
}
