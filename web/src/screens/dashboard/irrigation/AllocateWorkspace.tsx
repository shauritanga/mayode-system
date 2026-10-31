'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { HectareGrid } from './Blocks';
import {
  BASE, ConfirmDialog, Empty, Field, FormGrid, LoadError, MemberPicker, Notice, PageHeader, Panel, StatusBadge, TableSkeleton, errMsg,
  fmtDate, todayISO, useApi, useCanalBlockOptions, useIrrigation, type MemberLite,
} from './ui';

/** Page 9 — canal → block → hectare → member → confirm. */
export default function AllocateWorkspace({ bare = false }: { bare?: boolean } = {}) {
  const { schemeId, schemes, can } = useIrrigation();
  const search = useSearchParams();
  const scheme = schemes.find((s) => s.id === schemeId);
  const [canalId, setCanalId] = useState('');
  const [blockId, setBlockId] = useState(search.get('blockId') ?? '');
  const [pickedId, setPickedId] = useState(search.get('hectareId') ?? '');
  const [member, setMember] = useState<MemberLite | null>(null);
  const [guardian, setGuardian] = useState<MemberLite | null>(null);
  const [guardianFor, setGuardianFor] = useState<any>(null);
  const [endingGuardian, setEndingGuardian] = useState<any>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [releasing, setReleasing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const opts = useCanalBlockOptions(schemeId, canalId);
  const hectares = useApi<any>(blockId ? () => irrigationApi.hectares({ blockId, pageSize: 200 }) : null, [blockId]);
  const pending = useApi<any>(schemeId && can('irrigation_allocations', 'EDIT') ? () => irrigationApi.allocations({ schemeId, status: 'PENDING_APPROVAL', pageSize: 50 }) : null, [schemeId]);
  const block = opts.blocks.find((b: any) => b.id === blockId);

  const picked = hectares.data?.data.find((h: any) => h.id === pickedId) ?? null;

  const reset = () => { setPickedId(''); setMember(null); setGuardian(null); setNotes(''); setDate(todayISO()); setConfirm(false); };
  const submit = async () => {
    setSaving(true);
    try {
      const res = await irrigationApi.allocate({ hectareId: picked.id, farmerId: member!.id, guardianId: guardian?.id, allocatedOn: date, notes: notes.trim() || undefined });
      setMessage({ tone: 'success', text: res.data.status === 'PENDING_APPROVAL' ? `${picked.code} requested for ${member!.name}. It needs approval from someone else.` : `${picked.code} allocated to ${member!.name}.` });
      reset(); hectares.reload(); pending.reload();
    } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'Could not save the allocation.') }); setConfirm(false); hectares.reload(); } finally { setSaving(false); }
  };

  const canAllocate = can('irrigation_allocations', 'CREATE');
  return (
    <>
      {!bare && <PageHeader title="Hectare Allocation" subtitle="Choose a canal and block, pick a free hectare, then pick the member who will farm it." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Hectare Allocation' }]} />}
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      {scheme?.status === 'INACTIVE' && <Notice tone="error">This scheme is inactive; allocations are disabled.</Notice>}
      <Panel title="1 · Choose the block">
        <FormGrid>
          <Field label="Canal"><select className="input-field" value={canalId} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); reset(); }}><option value="">All canals</option>{opts.canals.map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => { setBlockId(e.target.value); reset(); }}><option value="">Select block</option>{opts.blocks.map((b: any) => <option key={b.id} value={b.id}>{b.code} ({b.stats.allocatedUnits}/{b.stats.hectareUnits} allocated)</option>)}</select></Field>
        </FormGrid>
      </Panel>

      {!blockId ? <Panel pad={false}><Empty title="Select a block to see its hectares" /></Panel> : (
        <>
          <LoadError message={hectares.error} onRetry={hectares.reload} />
          <Panel title={`2 · Pick a hectare${block ? ` in ${block.code}` : ''}`}>
            {hectares.loading ? <TableSkeleton rows={3} cols={6} /> : !hectares.data?.data.length ? <Empty title="This block has no hectare units" hint="Open the block and generate its hectare units." /> : (
              <HectareGrid hectares={hectares.data.data} onPick={(h) => { setPickedId(h.id); setMember(null); setGuardian(null); }} />
            )}
          </Panel>
          {picked && (
            <Panel title={`3 · ${picked.code}`}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Hectare {picked.hectareNumber} · {picked.areaHectares} ha · <StatusBadge value={picked.allocationStatus} /></div>
              {picked.allocationStatus === 'AVAILABLE' ? (
                !canAllocate ? <span className="muted">Your role cannot allocate hectares.</span> : (
                  <>
                    <FormGrid>
                      <MemberPicker schemeId={schemeId} value={member} onChange={setMember} label="Registered to" />
                      <MemberPicker schemeId={schemeId} value={guardian} onChange={setGuardian} label="Guardian (optional)" />
                      <Field label="Allocation date"><input type="date" className="input-field" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                      <Field label="Notes" wide><input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                    </FormGrid>
                    <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Use a guardian when the hectare is registered in a relative&apos;s name but is really owned by another member. It then shows on the guardian&apos;s profile.</p>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button type="button" className="btn-primary" disabled={!member || !date || guardian?.id === member?.id} onClick={() => setConfirm(true)}>Review allocation</button>
                      <button type="button" className="btn-secondary" onClick={reset}>Clear</button>
                    </div>
                  </>
                )
              ) : (
                <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                  <div>Held by <Link href={`${BASE}/allocation/farmers/${picked.farmer?.id}`}><strong>{picked.farmer?.name}</strong></Link> <span className="muted">· {picked.farmer?.memberNumber} · since {fmtDate(picked.allocatedOn)}</span></div>
                  <div>Guardian: {picked.guardian ? <Link href={`${BASE}/allocation/farmers/${picked.guardian.id}`}><strong>{picked.guardian.name}</strong></Link> : <span className="muted">none</span>}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link className="btn-secondary" href={`${BASE}/structure/hectares/${picked.id}`}>Hectare details</Link>
                    {picked.allocationStatus === 'ALLOCATED' && canAllocate && <Link className="btn-secondary" href={`${BASE}/allocation/transfers?add=1&hectareId=${picked.id}`}>Transfer to another member</Link>}
                    {picked.allocationStatus === 'ALLOCATED' && can('irrigation_allocations', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setGuardianFor(picked)}>{picked.guardian ? 'Change guardian' : 'Add guardian'}</button>}
                    {picked.guardian && can('irrigation_allocations', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setEndingGuardian(picked)}>End guardianship</button>}
                    {picked.allocationStatus === 'ALLOCATED' && can('irrigation_allocations', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setReleasing(picked)}>Release hectare</button>}
                  </div>
                </div>
              )}
            </Panel>
          )}
        </>
      )}

      {pending.data?.data.length ? (
        <Panel title={`Allocations awaiting approval (${pending.data.data.length})`} pad={false}>
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Farmer</th><th>Requested by</th><th>Date</th><th /></tr></thead><tbody>
            {pending.data.data.map((a: any) => (
              <tr key={a.id}><td>{a.hectare.code}</td><td>{a.farmer.name} <span className="muted">· {a.farmer.memberNumber}</span></td><td>{a.requestedBy ?? '—'}</td><td>{fmtDate(a.allocatedOn)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><PendingActions allocation={a} onDone={(m) => { setMessage({ tone: 'success', text: m }); pending.reload(); hectares.reload(); }} onError={(m) => setMessage({ tone: 'error', text: m })} /></td></tr>
            ))}
          </tbody></table></div>
        </Panel>
      ) : null}

      {confirm && picked && member && (
        <Modal title="Confirm allocation" onClose={() => !saving && setConfirm(false)} width="460px"
          footer={<><button type="button" className="btn-secondary" onClick={() => setConfirm(false)} disabled={saving}>Back</button><button type="button" className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Confirm and save'}</button></>}>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0, fontSize: 14 }}>
            <dt className="muted">Hectare</dt><dd style={{ margin: 0 }}>{picked.code} · {picked.areaHectares} ha</dd>
            <dt className="muted">Registered to</dt><dd style={{ margin: 0 }}>{member.name} · {member.memberNumber}</dd>
            {guardian && <><dt className="muted">Guardian</dt><dd style={{ margin: 0 }}>{guardian.name} · {guardian.memberNumber}</dd></>}
            <dt className="muted">Currently holds</dt><dd style={{ margin: 0 }}>{member.hectaresHeld} hectare(s) in this scheme</dd>
            <dt className="muted">Date</dt><dd style={{ margin: 0 }}>{fmtDate(date)}</dd>
          </dl>
        </Modal>
      )}
      {guardianFor && <GuardianModal hectare={guardianFor} schemeId={schemeId} onClose={() => setGuardianFor(null)}
        onSaved={() => { setMessage({ tone: 'success', text: `Guardian saved for ${guardianFor.code}.` }); setGuardianFor(null); hectares.reload(); }} />}
      {endingGuardian && <ConfirmDialog title={`End guardianship of ${endingGuardian.code}`} danger askReason reasonLabel="Reason" confirmLabel="End guardianship"
        body={<><strong>{endingGuardian.guardian?.name}</strong> will no longer be the guardian of {endingGuardian.code}. The hectare stays registered to {endingGuardian.farmer?.name}. The record is kept in the history.</>}
        onConfirm={async (reason) => { await irrigationApi.endGuardian(endingGuardian.allocationId, { reason }); setMessage({ tone: 'success', text: `Guardianship of ${endingGuardian.code} ended.` }); hectares.reload(); }} onClose={() => setEndingGuardian(null)} />}
      {releasing && <ConfirmDialog title={`Release ${releasing.code}`} danger askReason reasonLabel="Reason for releasing" confirmLabel="Release hectare"
        body={<>This ends <strong>{releasing.farmer?.name}</strong>&apos;s hold on {releasing.code} today and makes it available again. The record is kept in the history.</>}
        onConfirm={async (reason) => { await irrigationApi.releaseAllocation(releasing.allocationId, { reason }); setMessage({ tone: 'success', text: `${releasing.code} released.` }); reset(); hectares.reload(); }} onClose={() => setReleasing(null)} />}
    </>
  );
}

function PendingActions({ allocation, onDone, onError }: { allocation: any; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [reject, setReject] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await irrigationApi.approveAllocation(allocation.id); onDone(`${allocation.hectare.code} approved.`); } catch (e) { onError(errMsg(e)); } finally { setBusy(false); } }}>Approve</button>{' '}
      <button type="button" className="btn-secondary" onClick={() => setReject(true)}>Reject</button>
      {reject && <ConfirmDialog title="Reject allocation" danger askReason reasonLabel="Reason" confirmLabel="Reject" body={<>Reject the request for <strong>{allocation.hectare.code}</strong>? The hectare becomes available again.</>}
        onConfirm={async (reason) => { await irrigationApi.rejectAllocation(allocation.id, { reason }); onDone(`${allocation.hectare.code} request rejected.`); }} onClose={() => setReject(false)} />}
    </>
  );
}

function GuardianModal({ hectare, schemeId, onClose, onSaved }: { hectare: any; schemeId: string; onClose: () => void; onSaved: () => void }) {
  const [guardian, setGuardian] = useState<MemberLite | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try { await irrigationApi.setGuardian(hectare.allocationId, { guardianId: guardian!.id, note: note.trim() || undefined }); onSaved(); } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title={hectare.guardian ? 'Change guardian' : 'Add guardian'} subtitle={`${hectare.code} · registered to ${hectare.farmer?.name}`} onClose={() => !saving && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={saving || !guardian}>{saving ? 'Saving…' : 'Save guardian'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <MemberPicker schemeId={schemeId} value={guardian} onChange={setGuardian} label="Guardian" />
        <Field label="Note"><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}
