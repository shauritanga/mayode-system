'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import Modal from '@/components/Modal';
import {
  BASE, ConfirmDialog, DocumentsPanel, Empty, Field, Filters, FormGrid, LoadError, MemberPicker, Notice, PageHeader, Pager, TableSkeleton, StatusBadge,
  errMsg, fmtDate, todayISO, useApi, useCanalBlockOptions, useIrrigation, type MemberLite,
} from './ui';

const STATUSES = ['AWAITING_RECIPIENT', 'PENDING_APPROVAL', 'COMPLETED', 'REJECTED', 'CANCELLED'];

function NewTransferModal({ schemeId, presetHectareId, onClose, onSaved }: { schemeId: string; presetHectareId?: string; onClose: () => void; onSaved: (m: string) => void }) {
  const [canalId, setCanalId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [hectareId, setHectareId] = useState(presetHectareId ?? '');
  const [member, setMember] = useState<MemberLite | null>(null);
  const [transferDate, setTransferDate] = useState(todayISO());
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const opts = useCanalBlockOptions(schemeId, canalId);
  const preset = useApi<any>(presetHectareId ? () => irrigationApi.hectare(presetHectareId) : null, [presetHectareId]);
  const hectares = useApi<any>(blockId ? () => irrigationApi.hectares({ blockId, status: 'ALLOCATED', pageSize: 200 }) : null, [blockId]);
  const chosen = preset.data && preset.data.id === hectareId ? preset.data : hectares.data?.data.find((h: any) => h.id === hectareId);
  const save = async () => {
    if (!hectareId || !member || !reason.trim()) { setError('Choose an allocated hectare, the receiving member and give a reason.'); return; }
    setSaving(true); setError('');
    try {
      const res = await irrigationApi.createTransfer({ hectareId, toFarmerId: member.id, transferDate, effectiveDate, reason: reason.trim() });
      onSaved(res.data.status === 'AWAITING_RECIPIENT' ? 'Transfer requested. The receiving member has been sent an SMS and must accept it first.' : 'Transfer recorded. It completes once a Manager or Accountant signs it off.');
    } catch (e) { setError(errMsg(e, 'Could not record the transfer.')); setSaving(false); }
  };
  return (
    <Modal title="Transfer a hectare" subtitle="The current allocation is closed and a new one is opened for the receiving member." onClose={() => !saving && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record transfer'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {presetHectareId ? (
          <Field label="Hectare"><div className="input-field">{chosen ? `${chosen.code}${chosen.farmer ? ` · held by ${chosen.farmer.name}` : ''}` : 'Loading…'}</div></Field>
        ) : (
          <FormGrid>
            <Field label="Canal"><select className="input-field" value={canalId} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); setHectareId(''); }}><option value="">Select canal</option>{opts.canals.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
            <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => { setBlockId(e.target.value); setHectareId(''); }}><option value="">Select block</option>{opts.blocks.map((b: any) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
            <Field label="Allocated hectare" wide>
              <select className="input-field" value={hectareId} onChange={(e) => setHectareId(e.target.value)} disabled={!blockId}>
                <option value="">{hectares.loading ? 'Loading…' : 'Select hectare'}</option>
                {(hectares.data?.data ?? []).map((h: any) => <option key={h.id} value={h.id}>{h.code} · {h.farmer?.name}</option>)}
              </select>
            </Field>
          </FormGrid>
        )}
        <MemberPicker schemeId={schemeId} value={member} onChange={setMember} label="Receiving member" />
        <FormGrid>
          <Field label="Transfer date"><input type="date" className="input-field" max={todayISO()} value={transferDate} onChange={(e) => setTransferDate(e.target.value)} /></Field>
          <Field label="Effective date"><input type="date" className="input-field" max={todayISO()} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field>
          <Field label="Reason *" wide><textarea className="input-field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sale of rights, inheritance, member left the scheme" /></Field>
        </FormGrid>
        <span className="muted" style={{ fontSize: 12 }}>You can attach supporting documents to the transfer from the history list after saving.</span>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}

/** Page 11 — every hectare-to-farmer transfer, with the paperwork behind it. */
/** `bare` drops the page heading; `adding` / `onAddDone` let a parent page own the New transfer button. */
export default function Transfers({ bare = false, adding: addingProp, onAddDone }: { bare?: boolean; adding?: boolean; onAddDone?: () => void } = {}) {
  const { schemeId, can } = useIrrigation();
  const search = useSearchParams();
  const [filters, setFilters] = useState({ status: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [addingOwn, setAdding] = useState(!!search.get('add'));
  const adding = addingOwn || !!addingProp;
  const closeAdd = () => { setAdding(false); onAddDone?.(); };
  const [docs, setDocs] = useState<any>(null);
  const [action, setAction] = useState<{ kind: 'approve' | 'reject' | 'cancel'; transfer: any } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.transfers({ schemeId, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 20 }) : null, [schemeId, JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const canEdit = can('irrigation_allocations', 'EDIT');
  const canApprove = can('irrigation_transfer_approval', 'EDIT');
  return (
    <>
      {!bare && (
        <PageHeader title="Allocation Transfer History" subtitle="Hectare transfers between members. A transfer closes the previous allocation and opens a new one; nothing is overwritten."
        crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Transfer History' }]}
        actions={can('irrigation_allocations', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>New transfer</button> : undefined} />
      )}
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <Filters>
          <Field label="Search member"><input className="input-field" placeholder="Name or member no." value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="Status"><select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s === 'PENDING_APPROVAL' ? 'Pending approval' : s === 'AWAITING_RECIPIENT' ? 'Awaiting recipient' : s[0] + s.slice(1).toLowerCase()}</option>)}</select></Field>
          <Field label="Effective from"><input type="date" className="input-field" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></Field>
          <Field label="Effective to"><input type="date" className="input-field" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></Field>
        </Filters>
        {loading ? <TableSkeleton cols={9} /> : !data?.data.length ? <Empty title={Object.values(filters).some(Boolean) ? 'No transfers match these filters' : 'No transfers recorded'} hint="Transfers appear here once a hectare changes hands." /> : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Previous farmer</th><th>New farmer</th><th>Transfer date</th><th>Effective</th><th>Reason</th><th>Approved by</th><th>Processed by</th><th>Status</th><th /></tr></thead><tbody>
            {data.data.map((t: any) => (
              <tr key={t.id}>
                <td><Link href={`${BASE}/structure/hectares/${t.hectare.id}`} style={{ fontWeight: 600 }}>{t.hectare.code}</Link></td>
                <td><Link href={`${BASE}/allocation/farmers/${t.previousFarmer.id}`}>{t.previousFarmer.name}</Link><div className="muted" style={{ fontSize: 11 }}>{t.previousFarmer.memberNumber}</div></td>
                <td><Link href={`${BASE}/allocation/farmers/${t.newFarmer.id}`}>{t.newFarmer.name}</Link><div className="muted" style={{ fontSize: 11 }}>{t.newFarmer.memberNumber}</div></td>
                <td>{fmtDate(t.transferDate)}</td><td>{fmtDate(t.effectiveDate)}</td>
                <td style={{ maxWidth: 220 }}>{t.reason}{t.rejectedReason && <div className="muted" style={{ fontSize: 11 }}>Closed: {t.rejectedReason}</div>}</td>
                <td>{t.approvedBy ?? <span className="muted">{t.status === 'COMPLETED' ? 'Not required' : '—'}</span>}</td><td>{t.processedBy ?? '—'}</td>
                <td><StatusBadge value={t.status} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-secondary" onClick={() => setDocs(t)}>Documents{t.documents.length ? ` (${t.documents.length})` : ''}</button>
                  {t.status === 'AWAITING_RECIPIENT' && canEdit && <button type="button" className="btn-secondary" onClick={() => setAction({ kind: 'cancel', transfer: t })}>Cancel</button>}
                  {t.status === 'PENDING_APPROVAL' && canEdit && <> {canApprove && <button type="button" className="btn-primary" onClick={() => setAction({ kind: 'approve', transfer: t })}>Sign off</button>} <button type="button" className="btn-secondary" onClick={() => setAction({ kind: 'reject', transfer: t })}>Reject</button> <button type="button" className="btn-secondary" onClick={() => setAction({ kind: 'cancel', transfer: t })}>Cancel</button></>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {adding && <NewTransferModal schemeId={schemeId} presetHectareId={search.get('hectareId') ?? undefined} onClose={closeAdd} onSaved={(m) => { closeAdd(); setMessage({ tone: 'success', text: m }); reload(); }} />}
      {docs && (
        <Modal title={`Documents · ${docs.hectare.code}`} onClose={() => { setDocs(null); reload(); }} width="720px" footer={<button type="button" className="btn-secondary" onClick={() => { setDocs(null); reload(); }}>Close</button>}>
          <DocumentsPanel schemeId={schemeId} transferId={docs.id} canAdd={can('irrigation', 'CREATE')} />
        </Modal>
      )}
      {action && <ConfirmDialog
        title={action.kind === 'approve' ? 'Approve transfer' : action.kind === 'reject' ? 'Reject transfer' : 'Cancel transfer'}
        danger={action.kind !== 'approve'} askReason={action.kind !== 'approve'} reasonLabel="Reason" confirmLabel={action.kind === 'approve' ? 'Approve and complete' : action.kind === 'reject' ? 'Reject' : 'Cancel transfer'}
        body={action.kind === 'approve'
          ? <>Approving moves <strong>{action.transfer.hectare.code}</strong> from {action.transfer.previousFarmer.name} to <strong>{action.transfer.newFarmer.name}</strong>. The previous allocation is closed and cannot be reopened.</>
          : <>The hectare stays with {action.transfer.previousFarmer.name}. This request is closed and kept in the history.</>}
        onConfirm={async (reason) => {
          const id = action.transfer.id;
          if (action.kind === 'approve') await irrigationApi.approveTransfer(id);
          else if (action.kind === 'reject') await irrigationApi.rejectTransfer(id, { reason });
          else await irrigationApi.cancelTransfer(id, { reason });
          setMessage({ tone: 'success', text: action.kind === 'approve' ? 'Transfer approved and completed.' : 'Transfer closed.' }); reload();
        }} onClose={() => setAction(null)} />}
    </>
  );
}
