'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { boardApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, Tabs, errMsg, fmtDate, useApi, useCan, useDebounced } from '@/screens/dashboard/irrigation/ui';

const POSITIONS: [string, string][] = [
  ['CHAIRPERSON', 'Chairperson'], ['VICE_CHAIRPERSON', 'Vice chairperson'], ['SECRETARY', 'Secretary'], ['TREASURER', 'Treasurer'], ['MEMBER', 'Board member'],
];
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Add a registered farmer to the board, with a post and a term. */
function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const [picked, setPicked] = useState<any>(null);
  const [position, setPosition] = useState('MEMBER');
  const [termStart, setTermStart] = useState(todayIso());
  const [termEnd, setTermEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const found = useApi<any>(!picked && q.length >= 2 ? () => boardApi.candidates({ q }) : null, [q, picked]);

  const save = async () => {
    if (!picked) { setError('Choose a farmer from the list'); return; }
    if (!termStart) { setError('Choose the date the term starts'); return; }
    setBusy(true); setError('');
    try {
      await boardApi.add({ farmerId: picked.id, position, termStart, termEnd: termEnd || undefined, notes: notes.trim() || undefined });
      onDone(`${picked.name} is now on the board.`);
    } catch (e) { setError(errMsg(e, 'Could not add this board member.')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add a board member" subtitle="Choose from your registered farmers" onClose={onClose} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add to board'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {picked ? (
          <Field label="Farmer">
            <div className="input-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span><strong>{picked.name}</strong> <span className="muted">· {picked.memberNumber}</span></span>
              <button type="button" className="btn-secondary" onClick={() => { setPicked(null); setText(''); }}>Change</button>
            </div>
          </Field>
        ) : (
          <Field label="Farmer *" hint="Type at least 2 letters of the name, member number or phone">
            <input className="input-field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search registered farmers" autoComplete="off" autoFocus />
            {q.length >= 2 && (
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 220, overflow: 'auto', marginTop: 4 }}>
                {found.loading && !found.data ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>Searching…</div>
                  : !found.data?.data.length ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>No matching farmers. People already on the board are not listed.</div>
                  : found.data.data.map((m: any) => (
                    <button key={m.id} type="button" onClick={() => setPicked(m)}
                      style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'inherit' }}>
                      <span><strong>{m.name}</strong> <span className="muted">· {m.memberNumber}{m.village ? ` · ${m.village}` : ''}</span></span>
                      <span className="muted">{m.phone ?? 'no phone'}</span>
                    </button>
                  ))}
              </div>
            )}
          </Field>
        )}
        <Field label="Post" hint="Chairperson, vice chairperson, secretary and treasurer can each have one holder.">
          <select className="input-field" value={position} onChange={(e) => setPosition(e.target.value)}>{POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Term starts *"><input type="date" className="input-field" value={termStart} onChange={(e) => setTermStart(e.target.value)} /></Field>
          <Field label="Term ends" hint="Leave empty if not fixed"><input type="date" className="input-field" value={termEnd} min={termStart} onChange={(e) => setTermEnd(e.target.value)} /></Field>
        </div>
        <Field label="Notes"><input className="input-field" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Elected at the annual general meeting" /></Field>
      </div>
    </Modal>
  );
}

/** Change the post or term of a sitting member. */
function EditDialog({ member, onClose, onDone }: { member: any; onClose: () => void; onDone: (text: string) => void }) {
  const [position, setPosition] = useState(member.position);
  const [termEnd, setTermEnd] = useState(member.termEnd ? String(member.termEnd).slice(0, 10) : '');
  const [notes, setNotes] = useState(member.notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await boardApi.update(member.id, { position, ...(termEnd ? { termEnd } : {}), notes });
      onDone(`${member.farmer.name} was updated.`);
    } catch (e) { setError(errMsg(e, 'Could not save the change.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={member.farmer.name} subtitle={`Board member since ${fmtDate(member.termStart)}`} onClose={onClose} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Post"><select className="input-field" value={position} onChange={(e) => setPosition(e.target.value)}>{POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Term ends"><input type="date" className="input-field" value={termEnd} min={String(member.termStart).slice(0, 10)} onChange={(e) => setTermEnd(e.target.value)} /></Field>
        <Field label="Notes"><input className="input-field" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** End a term, keeping the record. */
function EndDialog({ member, onClose, onDone }: { member: any; onClose: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState('');
  const [endedOn, setEndedOn] = useState(todayIso());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reason.trim()) { setError('Say why the term is ending'); return; }
    setBusy(true); setError('');
    try { await boardApi.end(member.id, { reason: reason.trim(), endedOn }); onDone(`${member.farmer.name} is no longer on the board.`); }
    catch (e) { setError(errMsg(e, 'Could not end this term.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Remove ${member.farmer.name} from the board?`} subtitle="The record stays in the history." onClose={onClose} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Keep on board</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Remove from board'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Reason *"><input className="input-field" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Term finished, resigned" autoFocus /></Field>
        <Field label="Last day on the board"><input type="date" className="input-field" value={endedOn} min={String(member.termStart).slice(0, 10)} onChange={(e) => setEndedOn(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Board members: the registered farmers who sit on the AMCOS board, their posts and terms. */
export default function BoardPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [dialog, setDialog] = useState<{ kind: 'add' } | { kind: 'edit' | 'end'; member: any } | null>(null);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const list = useApi<any>(user?.mamcosId ? () => boardApi.list({ status: tab === 'past' ? 'ENDED' : 'ACTIVE' }) : null, [tab, refresh, user?.mamcosId]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);

  if (!can('board_members', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the board members permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Board members" /><Empty title="The board belongs to an AMCOS" hint="Sign in with an AMCOS account to manage its board." /></>;

  const done = (text: string) => { setDialog(null); setNotice(text); setRefresh((n) => n + 1); };
  const rows: any[] = list.data?.data ?? [];
  const vacant: string[] = list.data?.totals?.vacantPosts ?? [];

  return (
    <div>
      <PageHeader title="Board members" subtitle="The registered farmers who sit on the AMCOS board. Communication uses this list when you message the board."
        actions={can('board_members', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'add' })}>Add board member</button> : undefined} />
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={list.error} onRetry={list.reload} />
      {tab === 'current' && list.data && (
        <div className="metric-grid" style={{ marginBottom: 14 }}>
          <StatCard label="On the board" value={String(list.data.totals.active)} />
          <StatCard label="Posts without a holder" value={String(vacant.length)} tone={vacant.length ? 'warn' : undefined} />
        </div>
      )}
      {tab === 'current' && vacant.length > 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Not filled yet: {vacant.join(', ')}.</div>}
      <Tabs tabs={[{ id: 'current' as const, label: 'Current board' }, { id: 'past' as const, label: 'Past members' }]} active={tab} onChange={setTab} />
      <section className="table-panel">
        {list.loading && !list.data ? <TableSkeleton cols={6} /> : !rows.length ? (
          <Empty title={tab === 'current' ? 'No board members yet' : 'No past board members'}
            hint={tab === 'current' ? 'Add registered farmers who sit on the board and give each a post.' : 'Members whose term ended appear here.'}
            action={tab === 'current' && can('board_members', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'add' })}>Add board member</button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Member</th><th>Post</th><th>Phone</th><th>Term</th><th>{tab === 'past' ? 'Why it ended' : 'Notes'}</th>{tab === 'current' && <th />}</tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td><div style={{ fontWeight: 600 }}>{m.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{m.farmer.memberNumber}{m.farmer.village ? ` · ${m.farmer.village}` : ''}</div></td>
                    <td><span className={`badge ${m.position === 'MEMBER' ? 'badge-gray' : 'badge-green'}`}>{m.positionLabel}</span></td>
                    <td>{m.farmer.phone ?? <span className="muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.termStart)} – {tab === 'past' ? fmtDate(m.endedOn) : m.termEnd ? fmtDate(m.termEnd) : 'open'}{m.termLapsed && <div style={{ fontSize: 11, color: 'var(--gold-400)' }}>Term has run out</div>}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{(tab === 'past' ? m.endReason : m.notes) ?? '—'}</td>
                    {tab === 'current' && (
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {can('board_members', 'EDIT') && <><button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'edit', member: m })}>Edit</button>{' '}
                          <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'end', member: m })}>Remove</button></>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog?.kind === 'add' && <AddDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'edit' && <EditDialog member={dialog.member} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'end' && <EndDialog member={dialog.member} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
