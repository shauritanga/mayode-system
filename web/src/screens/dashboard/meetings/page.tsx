'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { farmersApi, meetingsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, ProgressBar, StatusBadge, TableSkeleton, Tabs, errMsg, useApi, useCan, useDebounced } from '@/screens/dashboard/irrigation/ui';

const KIND: Record<string, string> = { BOARD: 'Board meeting', AGM: 'General Meeting (Mkutano Mkuu)' };
const DEFAULT_QUORUM: Record<string, number> = { BOARD: 51, AGM: 25 };
const STATUS_LABEL: Record<string, string> = { SCHEDULED: 'Scheduled', CHECK_IN: 'Check-in open', IN_SESSION: 'In session', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
const when = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
/** A `datetime-local` value in the user's own time zone for an ISO date. */
const localInput = (iso?: string) => { const d = iso ? new Date(iso) : new Date(Date.now() + 86_400_000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function MeetingForm({ meeting, onClose, onDone }: { meeting?: any; onClose: () => void; onDone: (text: string) => void }) {
  const editing = !!meeting;
  const [kind, setKind] = useState(meeting?.kind ?? 'BOARD');
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [venue, setVenue] = useState(meeting?.venue ?? '');
  const [at, setAt] = useState(localInput(meeting?.scheduledAt));
  const [agenda, setAgenda] = useState(meeting?.agenda ?? '');
  const [quorum, setQuorum] = useState<string>(meeting ? String(meeting.quorumPercent) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (title.trim().length < 3 || venue.trim().length < 2 || agenda.trim().length < 3) { setError('Fill in the title, venue and agenda.'); return; }
    setBusy(true); setError('');
    try {
      const body: any = { title: title.trim(), venue: venue.trim(), agenda: agenda.trim(), scheduledAt: new Date(at).toISOString() };
      if (editing) { await meetingsApi.update(meeting.id, body); onDone('Meeting updated. Everyone invited has been sent the new details.'); }
      else { await meetingsApi.create({ ...body, kind, ...(quorum ? { quorumPercent: Number(quorum) } : {}) }); onDone(kind === 'BOARD' ? 'Meeting scheduled. Every board member has been sent an SMS with the agenda, date, time and venue.' : 'Meeting scheduled. Every member has been sent an SMS with the agenda, date, time and venue.'); }
    } catch (e) { setError(errMsg(e, 'Could not save the meeting.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={editing ? 'Change meeting' : 'Schedule a meeting'} subtitle="Everyone invited is texted automatically." onClose={onClose} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : editing ? 'Save and notify' : 'Schedule and notify'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {!editing && <Field label="Kind" hint={kind === 'BOARD' ? 'Invites the current board members.' : 'Invites every member of the AMCOS.'}>
          <select className="input-field" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
        <Field label="Title *"><input className="input-field" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Season budget review" autoFocus /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Date and time *"><input type="datetime-local" className="input-field" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
          <Field label="Venue *"><input className="input-field" maxLength={200} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. AMCOS office" /></Field>
        </div>
        <Field label="Agenda *" hint="Shortened in the SMS; members see all of it in the app."><textarea className="input-field" rows={4} maxLength={4000} value={agenda} onChange={(e) => setAgenda(e.target.value)} /></Field>
        {!editing && <Field label="Quorum (%)" hint={`Share of those invited who must check in before the meeting can start. Leave empty for ${DEFAULT_QUORUM[kind]}%.`}>
          <input type="number" className="input-field" min={1} max={100} value={quorum} onChange={(e) => setQuorum(e.target.value)} placeholder={String(DEFAULT_QUORUM[kind])} style={{ maxWidth: 120 }} /></Field>}
      </div>
    </Modal>
  );
}

function ResolutionForm({ onSave }: { onSave: (body: any) => Promise<void> }) {
  const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [outcome, setOutcome] = useState('PASSED');
  const [vf, setVf] = useState(''); const [va, setVa] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const go = async () => {
    if (title.trim().length < 3 || text.trim().length < 3) { setError('Give the resolution a title and its wording.'); return; }
    setBusy(true); setError('');
    try { await onSave({ title: title.trim(), text: text.trim(), outcome, ...(vf !== '' ? { votesFor: Number(vf) } : {}), ...(va !== '' ? { votesAgainst: Number(va) } : {}) }); setTitle(''); setText(''); setVf(''); setVa(''); setOutcome('PASSED'); }
    catch (e) { setError(errMsg(e, 'Could not log the resolution.')); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 10, padding: 14, border: '1px dashed var(--border-subtle)', borderRadius: 8 }}>
      <strong style={{ fontSize: 13 }}>Log a resolution</strong>
      {error && <Notice tone="error">{error}</Notice>}
      <input className="input-field" placeholder="Title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input-field" rows={3} placeholder="Exact wording of the resolution" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input-field" style={{ width: 130 }} value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="PASSED">Passed</option><option value="REJECTED">Rejected</option></select>
        <input type="number" min={0} className="input-field" style={{ width: 110 }} placeholder="Votes for" value={vf} onChange={(e) => setVf(e.target.value)} />
        <input type="number" min={0} className="input-field" style={{ width: 130 }} placeholder="Votes against" value={va} onChange={(e) => setVa(e.target.value)} />
        <button type="button" className="btn-primary" disabled={busy} onClick={go}>{busy ? 'Logging…' : 'Log resolution'}</button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>A logged resolution is permanent: it cannot be edited or deleted.</div>
    </div>
  );
}

/** Mark a member present: board members are listed; a general meeting is searched by name or member number. */
function PresentPicker({ meeting, onPick }: { meeting: any; onPick: (farmerId: string, name: string) => void }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const found = useApi<any>(meeting.kind === 'AGM' && q.length >= 2 ? () => farmersApi.getAll({ search: q, pageSize: 6 }) : null, [q]);
  if (meeting.kind === 'BOARD') {
    const missing = (meeting.expected ?? []).filter((e: any) => !e.present);
    return missing.length ? (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {missing.map((e: any) => <button key={e.farmerId} type="button" className="btn-secondary" onClick={() => onPick(e.farmerId, e.name)}>Mark {e.name} present</button>)}
      </div>
    ) : <span className="muted" style={{ fontSize: 13 }}>Every board member is present.</span>;
  }
  const rows: any[] = found.data?.data ?? [];
  return (
    <div>
      <input className="input-field" style={{ maxWidth: 360 }} placeholder="Find a member by name or member number" value={text} onChange={(e) => setText(e.target.value)} />
      {rows.length > 0 && <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4, maxWidth: 460 }}>
        {rows.map((f) => <li key={f.id}><button type="button" className="btn-secondary" style={{ width: '100%', textAlign: 'left' }} onClick={() => { onPick(f.id, `${f.firstName} ${f.lastName}`); setText(''); }}>{f.firstName} {f.lastName} <span className="muted">· {f.controlNumber}</span></button></li>)}
      </ul>}
    </div>
  );
}

function MeetingDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: (text?: string) => void }) {
  const can = useCan();
  const edit = can('board_meetings', 'EDIT');
  const { data: m, loading, error, reload } = useApi<any>(() => meetingsApi.get(id), [id]);
  const [dialog, setDialog] = useState<'edit' | 'cancel' | 'close' | null>(null);
  const [minutes, setMinutes] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const run = async (fn: () => Promise<any>, ok?: string) => {
    setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'success', text: ok }); reload(); onChanged(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e, 'That did not work.') }); }
  };
  if (loading && !m) return <TableSkeleton cols={4} />;
  if (error || !m) return <><LoadError message={error || 'Meeting not found'} onRetry={reload} /><button type="button" className="btn-secondary" onClick={onBack}>Back</button></>;
  const q = m.quorum;
  return (
    <div>
      <button type="button" className="btn-secondary" onClick={onBack} style={{ marginBottom: 12 }}>← All meetings</button>
      {msg && <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Notice>}
      <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>{KIND[m.kind]}</div>
            <h2 style={{ margin: '2px 0 6px' }}>{m.title}</h2>
            <div style={{ fontSize: 14 }}>{when(m.scheduledAt)} · {m.venue}</div>
          </div>
          <div><StatusBadge value={m.status} label={STATUS_LABEL[m.status]} /></div>
        </div>
        <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, margin: '12px 0 0' }}>{m.agenda}</p>
        {m.cancelReason && <p className="muted" style={{ fontSize: 13 }}>Cancelled: {m.cancelReason}</p>}
        {edit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {m.status === 'SCHEDULED' && <button type="button" className="btn-primary" onClick={() => run(() => meetingsApi.openCheckIn(id), 'Check-in is open. Members can check in from the MAYODE app.')}>Open check-in</button>}
            {m.status === 'SCHEDULED' && <button type="button" className="btn-secondary" onClick={() => setDialog('edit')}>Change</button>}
            {(m.status === 'SCHEDULED' || m.status === 'CHECK_IN') && <button type="button" className="btn-secondary" onClick={() => setDialog('cancel')}>Cancel meeting</button>}
            {m.status === 'CHECK_IN' && <button type="button" className="btn-primary" disabled={!q.met} title={q.met ? '' : 'Waiting for a quorum'} onClick={() => run(() => meetingsApi.start(id), 'The meeting has started.')}>Start meeting</button>}
            {m.status === 'IN_SESSION' && <button type="button" className="btn-primary" onClick={() => setDialog('close')}>Close and lock minutes</button>}
          </div>
        )}
      </section>

      {['CHECK_IN', 'IN_SESSION', 'CLOSED'].includes(m.status) && (
        <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong>Attendance</strong>
            <span style={{ fontSize: 13 }} className={q.met ? '' : 'muted'}>{q.present} present · {q.needed} needed for quorum ({m.quorumPercent}% of {q.invited}) · {q.met ? 'Quorum reached' : 'No quorum yet'}</span>
          </div>
          <div style={{ margin: '8px 0 12px' }}><ProgressBar pct={Math.min(100, (q.present / Math.max(q.needed, 1)) * 100)} label="Quorum" /></div>
          {edit && (m.status === 'CHECK_IN' || m.status === 'IN_SESSION') && <div style={{ marginBottom: 12 }}><PresentPicker meeting={m} onPick={(fid, name) => run(() => meetingsApi.markPresent(id, fid), `${name} is marked present.`)} /></div>}
          {!m.attendance.length ? <div className="muted" style={{ fontSize: 13 }}>Nobody has checked in yet.</div> : (
            <table className="data-table"><thead><tr><th>Member</th><th>Checked in</th><th>How</th></tr></thead><tbody>
              {m.attendance.map((a: any) => <tr key={a.farmerId}><td>{a.name} <span className="muted">· {a.memberNumber}</span></td><td>{when(a.checkedInAt)}</td><td>{a.method === 'SELF' ? 'On their phone' : 'Marked by the office'}</td></tr>)}
            </tbody></table>
          )}
        </section>
      )}

      {['IN_SESSION', 'CLOSED'].includes(m.status) && (
        <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
          <strong>Resolutions</strong>
          {!m.resolutions.length ? <div className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>None logged yet.</div> : (
            <ol style={{ paddingLeft: 18, margin: '10px 0 14px', display: 'grid', gap: 10 }}>
              {m.resolutions.map((r: any) => (
                <li key={r.id}><strong>{r.title}</strong> <span className={`badge ${r.outcome === 'PASSED' ? 'badge-green' : 'badge-red'}`}>{r.outcome === 'PASSED' ? 'Passed' : 'Rejected'}</span>
                  {(r.votesFor != null || r.votesAgainst != null) && <span className="muted" style={{ fontSize: 12 }}> · {r.votesFor ?? '—'} for, {r.votesAgainst ?? '—'} against</span>}
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{r.text}</div></li>
              ))}
            </ol>
          )}
          {edit && <ResolutionForm onSave={async (body) => { await meetingsApi.addResolution(id, body); reload(); onChanged(); }} />}
        </section>
      )}

      {m.status === 'CLOSED' && (
        <section className="table-panel" style={{ padding: 18 }}>
          <strong>Minutes</strong> <span className="badge badge-gray">Locked</span>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.minutes}</p>
        </section>
      )}

      {dialog === 'edit' && <MeetingForm meeting={m} onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); setMsg({ tone: 'success', text: t }); reload(); onChanged(); }} />}
      {dialog === 'cancel' && <ConfirmDialog title="Cancel this meeting?" danger askReason reasonLabel="Reason (sent to everyone invited)" confirmLabel="Cancel meeting"
        body={<>Everyone invited will be told the meeting is cancelled.</>} onConfirm={async (reason) => { await meetingsApi.cancel(id, { reason }); setMsg({ tone: 'success', text: 'Meeting cancelled and everyone told.' }); reload(); onChanged(); }} onClose={() => setDialog(null)} />}
      {dialog === 'close' && (
        <Modal title="Close the meeting" subtitle="The minutes are locked once the meeting is closed." onClose={() => setDialog(null)} width="620px"
          footer={<><button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Back</button><button type="button" className="btn-primary" disabled={minutes.trim().length < 10} onClick={async () => { setDialog(null); await run(() => meetingsApi.close(id, { minutes: minutes.trim() }), 'Meeting closed. The minutes are locked.'); }}>Close and lock</button></>}>
          <Field label="Minutes *" hint="Who opened, what was discussed, what was decided."><textarea className="input-field" rows={10} value={minutes} onChange={(e) => setMinutes(e.target.value)} autoFocus /></Field>
        </Modal>
      )}
    </div>
  );
}

/** Board meetings and the General Meeting: scheduling with SMS invitations, check-in and quorum, minutes, and the archive of resolutions. */
export default function MeetingsPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'upcoming' | 'past' | 'resolutions'>('upcoming');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const list = useApi<any>(user?.mamcosId && tab !== 'resolutions' ? () => meetingsApi.list({ when: tab }) : null, [tab, refresh, user?.mamcosId]);
  const archive = useApi<any>(user?.mamcosId && tab === 'resolutions' ? () => meetingsApi.resolutions() : null, [tab, refresh, user?.mamcosId]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(t); }, [notice]);

  if (!can('board_meetings', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the meetings permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Meetings" /><Empty title="Meetings belong to an AMCOS" hint="Sign in with an AMCOS account to manage its meetings." /></>;
  if (openId) return <MeetingDetail id={openId} onBack={() => setOpenId(null)} onChanged={() => setRefresh((n) => n + 1)} />;

  const rows: any[] = list.data?.data ?? [];
  const resolutions: any[] = archive.data?.data ?? [];
  return (
    <div>
      <PageHeader title="Meetings" subtitle="Schedule board meetings and the General Meeting. Everyone invited is texted automatically; members check in on their phone and the meeting starts once there is a quorum."
        actions={can('board_meetings', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Schedule a meeting</button> : undefined} />
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={list.error || archive.error} onRetry={() => setRefresh((n) => n + 1)} />
      <Tabs tabs={[{ id: 'upcoming' as const, label: 'Upcoming' }, { id: 'past' as const, label: 'Past' }, { id: 'resolutions' as const, label: 'Resolutions' }]} active={tab} onChange={setTab} />
      <section className="table-panel">
        {tab === 'resolutions' ? (
          archive.loading && !archive.data ? <TableSkeleton cols={4} /> : !resolutions.length ? <Empty title="No resolutions yet" hint="Resolutions logged at meetings are kept here for good." /> : (
            <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Resolution</th><th>Meeting</th><th>Outcome</th><th>Votes</th></tr></thead><tbody>
              {resolutions.map((r) => (
                <tr key={r.id}><td><strong>{r.title}</strong><div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.text}</div></td>
                  <td><button type="button" className="btn-secondary" onClick={() => setOpenId(r.meeting.id)}>{r.meeting.title}</button><div className="muted" style={{ fontSize: 11 }}>{KIND[r.meeting.kind]} · {when(r.meeting.scheduledAt)}</div></td>
                  <td><span className={`badge ${r.outcome === 'PASSED' ? 'badge-green' : 'badge-red'}`}>{r.outcome === 'PASSED' ? 'Passed' : 'Rejected'}</span></td>
                  <td>{r.votesFor != null || r.votesAgainst != null ? `${r.votesFor ?? '—'} for / ${r.votesAgainst ?? '—'} against` : '—'}</td></tr>
              ))}
            </tbody></table></div>
          )
        ) : list.loading && !list.data ? <TableSkeleton cols={5} /> : !rows.length ? (
          <Empty title={tab === 'upcoming' ? 'No meetings scheduled' : 'No past meetings'} hint={tab === 'upcoming' ? 'Schedule a board meeting or the General Meeting; everyone invited gets an SMS.' : 'Closed and cancelled meetings appear here.'}
            action={tab === 'upcoming' && can('board_meetings', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Schedule a meeting</button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Meeting</th><th>When</th><th>Venue</th><th>Invited</th><th>Status</th><th /></tr></thead><tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td><div style={{ fontWeight: 600 }}>{m.title}</div><div className="muted" style={{ fontSize: 11 }}>{KIND[m.kind]}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>{when(m.scheduledAt)}</td><td>{m.venue}</td>
                <td>{m.present}/{m.invited} present</td>
                <td><StatusBadge value={m.status} label={STATUS_LABEL[m.status]} /></td>
                <td style={{ textAlign: 'right' }}><button type="button" className="btn-secondary" onClick={() => setOpenId(m.id)}>Open</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      {adding && <MeetingForm onClose={() => setAdding(false)} onDone={(t) => { setAdding(false); setNotice(t); setRefresh((n) => n + 1); }} />}
    </div>
  );
}
