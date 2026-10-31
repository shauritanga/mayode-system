'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import {
  BASE, ConfirmDialog, Empty, Field, FormGrid, LoadError, MemberPicker, Notice, PageHeader, Panel, StatusBadge, TableSkeleton, Tabs,
  errMsg, fmtDate, todayISO, useApi, useCanalBlockOptions, useIrrigation, type MemberLite,
} from './ui';

/** The two appointment forms share their date, status and notes fields. */
function AppointmentSection({ position }: { position: 'CANAL_LEADER' | 'BLOCK_LEADER' }) {
  const { schemeId, can } = useIrrigation();
  const search = useSearchParams();
  const isBlock = position === 'BLOCK_LEADER';
  const [canalId, setCanalId] = useState(search.get('canalId') ?? '');
  const [blockId, setBlockId] = useState(isBlock ? (search.get('blockId') ?? '') : '');
  const [member, setMember] = useState<MemberLite | null>(null);
  const [appointedOn, setAppointedOn] = useState(todayISO());
  const [termStart, setTermStart] = useState(todayISO());
  const [termEnd, setTermEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState<{ message: string } | null>(null);
  const [ending, setEnding] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const opts = useCanalBlockOptions(schemeId, canalId);
  const current = useApi<any>(schemeId ? () => irrigationApi.leadership({ schemeId, position, status: 'ACTIVE', canalId: canalId || undefined, pageSize: 100 }) : null, [schemeId, position, canalId]);
  const expired = useApi<any>(schemeId ? () => irrigationApi.leadership({ schemeId, position, status: 'TERM_EXPIRED', canalId: canalId || undefined, pageSize: 100 }) : null, [schemeId, position, canalId]);
  const target = isBlock ? blockId : canalId;
  const existing = [...(current.data?.data ?? []), ...(expired.data?.data ?? [])].find((l: any) => (isBlock ? l.block?.id === blockId : l.canal.id === canalId)) ?? null;
  const canCreate = can('irrigation_leadership', 'CREATE');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!canalId) e.canalId = 'Choose the canal';
    if (isBlock && !blockId) e.blockId = 'Choose the block';
    if (!member) e.member = 'Choose a member';
    if (!termStart) e.termStart = 'Term start is required';
    if (termEnd && termEnd < termStart) e.termEnd = 'Term end cannot be before term start';
    if (appointedOn > todayISO()) e.appointedOn = 'Appointment date cannot be in the future';
    return e;
  };
  const submit = async (replaceExisting: boolean) => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setMessage(null);
    try {
      await irrigationApi.appoint({ position, canalId, blockId: isBlock ? blockId : undefined, farmerId: member!.id, appointedOn, termStart, termEnd: termEnd || undefined, notes: notes.trim() || undefined, replaceExisting });
      setMessage({ tone: 'success', text: `${member!.name} appointed.` });
      setMember(null); setNotes(''); setTermEnd(''); setReplace(null);
      current.reload(); expired.reload();
    } catch (e: any) {
      const text = errMsg(e, 'Could not save the appointment.');
      if (e?.response?.status === 409 && /Confirm replacement/.test(text)) setReplace({ message: text }); else setMessage({ tone: 'error', text });
    } finally { setSaving(false); }
  };

  const rows = [...(current.data?.data ?? []), ...(expired.data?.data ?? [])];
  return (
    <>
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      {canCreate && (
        <Panel title={isBlock ? 'Appoint a block leader' : 'Appoint a canal leader'}>
          <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} noValidate>
            <FormGrid>
              <Field label="Canal *" error={errors.canalId}><select className="input-field" value={canalId} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); }}><option value="">Select canal</option>{opts.canals.map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
              {isBlock && <Field label="Block *" error={errors.blockId}><select className="input-field" value={blockId} onChange={(e) => setBlockId(e.target.value)} disabled={!canalId}><option value="">Select block</option>{opts.blocks.map((b: any) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>}
              <div>{errors.member && <span style={{ color: 'var(--red-400)', fontSize: 12 }}>{errors.member}</span>}<MemberPicker schemeId={schemeId} value={member} onChange={setMember} purpose="leadership" label="Member *" /></div>
              <Field label="Appointment date" error={errors.appointedOn}><input type="date" className="input-field" max={todayISO()} value={appointedOn} onChange={(e) => setAppointedOn(e.target.value)} /></Field>
              <Field label="Term start *" error={errors.termStart}><input type="date" className="input-field" value={termStart} onChange={(e) => setTermStart(e.target.value)} /></Field>
              <Field label="Term end" error={errors.termEnd} hint="Leave empty for an open-ended term"><input type="date" className="input-field" min={termStart} value={termEnd} onChange={(e) => setTermEnd(e.target.value)} /></Field>
              <Field label="Status"><input className="input-field" value="Active on save" disabled /></Field>
              <Field label="Notes" wide><input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </FormGrid>
            {target && existing && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Current {isBlock ? 'block' : 'canal'} leader: <strong>{existing.leader.name}</strong> (term {existing.status === 'TERM_EXPIRED' ? 'expired' : `to ${existing.termEnd ? fmtDate(existing.termEnd) : 'open'}`}). Saving will ask you to confirm the replacement.</div>}
            <div style={{ marginTop: 12 }}><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save appointment'}</button></div>
          </form>
        </Panel>
      )}
      <Panel title={isBlock ? 'Current block leaders' : 'Current canal leaders'} pad={false}>
        <LoadError message={current.error} onRetry={current.reload} />
        {current.loading ? <TableSkeleton rows={4} cols={5} /> : !rows.length ? <Empty title={`No ${isBlock ? 'block' : 'canal'} leaders assigned${canalId ? ' for this canal' : ''}`} /> : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>{isBlock ? 'Block' : 'Canal'}</th><th>Leader</th><th>Appointed</th><th>Term</th><th>Status</th><th>Notes</th><th /></tr></thead><tbody>
            {rows.map((l: any) => <tr key={l.id}><td style={{ fontWeight: 600 }}>{isBlock ? l.block?.code : l.canal.code}</td><td>{l.leader.name} <span className="muted">· {l.leader.memberNumber}</span></td><td>{fmtDate(l.appointedOn)}</td><td>{fmtDate(l.termStart)} – {l.termEnd ? fmtDate(l.termEnd) : 'open'}</td><td><StatusBadge value={l.status} label={l.status === 'TERM_EXPIRED' ? 'Term expired' : undefined} /></td><td>{l.notes ?? '—'}</td>
              <td>{can('irrigation_leadership', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setEnding(l)}>End appointment</button>}</td></tr>)}
          </tbody></table></div>
        )}
      </Panel>
      {replace && <ConfirmDialog title="Replace current leader" confirmLabel="End current and appoint" danger
        body={<>{replace.message}<br /><br />The previous appointment is closed today and kept in the leadership history, linked to this new one.</>}
        onConfirm={async () => { await submit(true); }} onClose={() => setReplace(null)} />}
      {ending && <ConfirmDialog title="End appointment" confirmLabel="End appointment" danger askReason reasonLabel="Reason (e.g. resigned, term completed)"
        body={<>End <strong>{ending.leader.name}</strong>&apos;s appointment as {isBlock ? `leader of ${ending.block?.code}` : `leader of ${ending.canal.code}`}? The position becomes vacant.</>}
        onConfirm={async (reason) => { await irrigationApi.endLeadership(ending.id, { reason }); setMessage({ tone: 'success', text: 'Appointment ended.' }); current.reload(); expired.reload(); }} onClose={() => setEnding(null)} />}
    </>
  );
}

/** Page 13 — appoint and replace canal and block leaders. */
export default function Assignments({ bare = false }: { bare?: boolean } = {}) {
  const search = useSearchParams();
  const [tab, setTab] = useState<'canal' | 'block'>(search.get('blockId') ? 'block' : 'canal');
  return (
    <>
      {!bare && <PageHeader title="Canal & Block Leader Assignments" subtitle="One active leader per canal and per block. Replacing a leader keeps the previous appointment in the history." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Leader Assignments' }]} />}
      <Tabs tabs={[{ id: 'canal', label: 'Canal leaders' }, { id: 'block', label: 'Block leaders' }]} active={tab} onChange={setTab} />
      {tab === 'canal' ? <AppointmentSection key="canal" position="CANAL_LEADER" /> : <AppointmentSection key="block" position="BLOCK_LEADER" />}
    </>
  );
}
