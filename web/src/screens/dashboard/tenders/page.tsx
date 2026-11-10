'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { tendersApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatusBadge, TableSkeleton, Tabs, errMsg, fmtDate, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const clock = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const localInput = (hours: number) => { const d = new Date(Date.now() + hours * 3_600_000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const CATEGORY: Record<string, string> = { CANAL_CLEARING: 'Canal clearing', DESILTING: 'Desilting', ROAD_GRADING: 'Road grading', DRAINAGE_REPAIR: 'Drainage repair', OTHER: 'Other' };
const STATUS: Record<string, [string, string]> = {
  DRAFT: ['Draft', 'badge-gray'], OPEN: ['Open for bids', 'badge-green'], EVALUATION: ['Evaluation', 'badge-gold'], AWARDED: ['Awarded', 'badge-blue'], COMPLETED: ['Completed', 'badge-green'], CANCELLED: ['Cancelled', 'badge-red'],
};
const MILESTONE: Record<string, [string, string]> = {
  PENDING: ['Work under way', 'badge-gray'], SUBMITTED: ['Waiting for inspection', 'badge-gold'], SIGNED_OFF: ['Inspected', 'badge-blue'], APPROVED: ['Payment approved', 'badge-blue'], PAID: ['Paid', 'badge-green'],
};
const Badge = ({ map, value }: { map: Record<string, [string, string]>; value: string }) => <span className={`badge ${map[value]?.[1] ?? 'badge-gray'}`}>{map[value]?.[0] ?? value}</span>;

// ───────────────────────── new tender ─────────────────────────

function NewTender({ onClose, onDone }: { onClose: () => void; onDone: (id: string, text: string) => void }) {
  const { data } = useApi<any>(() => tendersApi.structure(), []);
  const canals: any[] = data?.canals ?? []; const allBlocks: any[] = data?.blocks ?? [];
  const [f, setF] = useState({ title: '', category: 'DESILTING', scope: '', canalId: '', budgetCeiling: '', opensAt: localInput(0), closesAt: localInput(24 * 14), requiredEquipment: '1' });
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [w, setW] = useState({ wPrice: '60', wEquipment: '15', wExperience: '10', wPerformance: '15' });
  const [ms, setMs] = useState([{ title: 'Mobilisation and first part of the work', percent: '30' }, { title: 'Main work', percent: '40' }, { title: 'Completion and handover', percent: '30' }]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const wSum = Object.values(w).reduce((n, x) => n + (Number(x) || 0), 0);
  const mSum = ms.reduce((n, x) => n + (Number(x.percent) || 0), 0);
  const blocks = allBlocks.filter((b) => !f.canalId || b.canalId === f.canalId);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (f.title.trim().length < 5 || f.scope.trim().length < 20) { setError('Give the tender a title and describe the work (at least a couple of sentences).'); return; }
    if (!f.canalId && !blockIds.length) { setError('Choose the canal or blocks the work is on: their chairmen inspect it.'); return; }
    if (!Number(f.budgetCeiling)) { setError('Enter the budget ceiling.'); return; }
    if (wSum !== 100) { setError('The evaluation weights must add up to 100.'); return; }
    if (mSum !== 100) { setError('The payment milestones must add up to 100%.'); return; }
    setBusy(true); setError('');
    try {
      const res = await tendersApi.create({
        title: f.title.trim(), scope: f.scope.trim(), category: f.category, canalId: f.canalId || undefined, blockIds, budgetCeiling: Number(f.budgetCeiling),
        opensAt: new Date(f.opensAt).toISOString(), closesAt: new Date(f.closesAt).toISOString(), requiredEquipment: Number(f.requiredEquipment) || 1,
        wPrice: Number(w.wPrice), wEquipment: Number(w.wEquipment), wExperience: Number(w.wExperience), wPerformance: Number(w.wPerformance),
        milestones: ms.map((m) => ({ title: m.title.trim(), percent: Number(m.percent) })),
      });
      onDone(res.data.id, `Tender ${res.data.reference} saved as a draft. Review it, then publish.`);
    } catch (e) { setError(errMsg(e, 'Could not save the tender.')); } finally { setBusy(false); }
  };
  return (
    <Modal title="New tender" subtitle="Describe the work, the budget ceiling, the deadline and how bids will be judged." onClose={onClose} width="720px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save as draft'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Title *"><input className="input-field" maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Desilting of Canal 3, blocks 4 to 8" autoFocus /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Kind of work"><select className="input-field" value={f.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Budget ceiling (TZS) *" hint="Bids above this are not accepted."><input className="input-field" inputMode="decimal" value={f.budgetCeiling} onChange={(e) => set('budgetCeiling', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        </div>
        <Field label="Scope of work *"><textarea className="input-field" rows={4} maxLength={8000} value={f.scope} onChange={(e) => set('scope', e.target.value)} placeholder="What must be done, where, to what standard." /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Canal"><select className="input-field" value={f.canalId} onChange={(e) => { set('canalId', e.target.value); setBlockIds([]); }}><option value="">Choose a canal…</option>{canals.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Bids open"><input type="datetime-local" className="input-field" value={f.opensAt} onChange={(e) => set('opensAt', e.target.value)} /></Field>
        </div>
        <Field label="Blocks the work is on" hint="Their block chairmen inspect the work. Leave empty if it is the whole canal."><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {blocks.map((b) => <label key={b.id} className="badge badge-gray" style={{ cursor: 'pointer' }}><input type="checkbox" checked={blockIds.includes(b.id)} onChange={(e) => setBlockIds((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))} /> {farmId(b.code)}</label>)}
          {!blocks.length && <span className="muted" style={{ fontSize: 13 }}>No blocks.</span>}</div></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Bids close *" hint="At least an hour from now. Bids stay sealed until then."><input type="datetime-local" className="input-field" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} /></Field>
          <Field label="Machines the work needs" hint="Used to score equipment."><input type="number" min={1} className="input-field" value={f.requiredEquipment} onChange={(e) => set('requiredEquipment', e.target.value)} /></Field>
        </div>
        <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 700 }}>How bids are scored (must add up to 100: now {wSum})</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {([['wPrice', 'Price'], ['wEquipment', 'Equipment'], ['wExperience', 'Experience'], ['wPerformance', 'Past performance']] as const).map(([k, l]) => (
              <Field key={k} label={l}><input type="number" min={0} max={100} className="input-field" value={w[k]} onChange={(e) => setW((p) => ({ ...p, [k]: e.target.value }))} /></Field>))}
          </div>
        </fieldset>
        <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 700 }}>Payment milestones (must add up to 100%: now {mSum}%)</legend>
          {ms.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 8, marginBottom: 8 }}>
              <input className="input-field" aria-label={`Milestone ${i + 1}`} value={m.title} onChange={(e) => setMs((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input type="number" min={1} max={100} className="input-field" aria-label="Percent" value={m.percent} onChange={(e) => setMs((p) => p.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} />
              <button type="button" className="btn-secondary" disabled={ms.length < 2} onClick={() => setMs((p) => p.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn-secondary" disabled={ms.length >= 10} onClick={() => setMs((p) => [...p, { title: '', percent: '10' }])}>Add a milestone</button>
        </fieldset>
      </div>
    </Modal>
  );
}

// ───────────────────────── one tender ─────────────────────────

function PayDialog({ milestone, onClose, onDone }: { milestone: any; onClose: () => void; onDone: (t: string) => void }) {
  const [method, setMethod] = useState('MOBILE_MONEY'); const [reference, setReference] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reference.trim()) { setError('Enter the bank or mobile money reference.'); return; }
    setBusy(true); setError('');
    try { await tendersApi.pay(milestone.id, { method, reference: reference.trim() }); onDone('Payment recorded and booked. The contractor has been told.'); }
    catch (e) { setError(errMsg(e, 'Could not record the payment.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Record payment: ${milestone.title}`} subtitle={tzs(milestone.amount)} onClose={onClose} width="460px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Record payment'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="muted" style={{ fontSize: 13 }}>Send the money to the contractor’s account first, then record it here. This books the expense and cannot be changed.</div>
        <Field label="How it was paid"><select className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank transfer</option><option value="CASH">Cash</option></select></Field>
        <Field label="Reference *"><input className="input-field" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction or receipt number" autoFocus /></Field>
      </div>
    </Modal>
  );
}

function TenderDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const can = useCan();
  const { data: t, loading, error, reload } = useApi<any>(() => tendersApi.get(id), [id]);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [dialog, setDialog] = useState<any>(null);
  const [note, setNote] = useState('');
  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); reload(); onChanged(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e, 'That did not work.') }); }
  };
  if (loading && !t) return <TableSkeleton cols={4} />;
  if (error || !t) return <><LoadError message={error || 'Tender not found'} onRetry={reload} /><button type="button" className="btn-secondary" onClick={onBack}>Back</button></>;
  const closed = !!t.closed;
  const edit = can('tenders', 'EDIT'); const approve = can('tender_approval', 'EDIT');
  return (
    <div>
      <button type="button" className="btn-secondary" onClick={onBack} style={{ marginBottom: 12 }}>← All tenders</button>
      {msg && <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Notice>}
      <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><div className="muted" style={{ fontSize: 12 }}>{t.reference} · {CATEGORY[t.category]}</div><h2 style={{ margin: '2px 0 6px' }}>{t.title}</h2></div>
          <Badge map={STATUS} value={t.status} />
        </div>
        <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{t.scope}</p>
        <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>Budget ceiling <strong>{tzs(t.budgetCeiling)}</strong></span><span>Bids {clock(t.opensAt)} to {clock(t.closesAt)}</span>
          <span>Scoring: price {t.criteria.price} · equipment {t.criteria.equipment} · experience {t.criteria.experience} · past performance {t.criteria.performance}</span>
        </div>
        {t.cancelReason && <p className="muted" style={{ fontSize: 13 }}>Cancelled: {t.cancelReason}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {t.status === 'DRAFT' && edit && <button type="button" className="btn-primary" onClick={() => run(() => tendersApi.publish(id), 'Published. Every approved contractor has been sent an SMS.')}>Publish</button>}
          {t.status === 'OPEN' && edit && <button type="button" className="btn-primary" disabled={!closed} title={closed ? '' : 'Bids stay sealed until the closing time'} onClick={() => run(() => tendersApi.openBids(id), 'The bids are open and ranked.')}>Open the sealed bids</button>}
          {['DRAFT', 'OPEN', 'EVALUATION'].includes(t.status) && edit && <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'cancel' })}>Cancel tender</button>}
        </div>
        {t.status === 'OPEN' && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t.bidCount} bid{t.bidCount === 1 ? '' : 's'} received. Nobody can see them until the closing time.</div>}
      </section>

      {t.bids && (
        <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
          <strong>Bids, ranked</strong>
          <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>{t.recommended || ['AWARDED', 'COMPLETED'].includes(t.status) ? 'Names are shown now that a bid has been recommended.' : 'Names are hidden until a bid is recommended, so the ranking cannot be swayed by who bid.'}</div>
          {!t.bids.length ? <Empty title="No bids were received" hint="You can cancel this tender and publish it again." /> : (
            <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>#</th><th>Bid</th><th className="num">Price</th><th className="num">Score</th><th>Price / equipment / experience / past</th><th>Days</th><th /></tr></thead><tbody>
              {t.bids.map((b: any) => (
                <tr key={b.id} style={t.recommended?.bidId === b.id ? { background: 'rgba(22,163,74,.08)' } : undefined}>
                  <td>{b.rank}</td>
                  <td><strong>{b.contractor ? b.contractor.name : b.code}</strong>{b.contractor && <div className="muted" style={{ fontSize: 11 }}>{b.code} · {b.contractor.phone}</div>}
                    <details><summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Proposal</summary><div style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxWidth: 420 }}>{b.technicalProposal}</div>
                      {b.documentUrls?.map((u: string) => <div key={u}><a href={u} target="_blank" rel="noreferrer">Document</a></div>)}</details></td>
                  <td className="num">{tzs(b.price)}</td><td className="num"><strong>{b.total}</strong></td>
                  <td style={{ fontSize: 12.5 }}>{b.parts.price} / {b.parts.equipment} / {b.parts.experience} / {b.parts.performance}<div className="muted" style={{ fontSize: 11 }}>{b.equipmentOffered} machine(s) · {b.yearsExperience} yrs · {b.completedContracts} finished here{b.pastRating != null ? ` (${b.pastRating}/5)` : ''}</div></td>
                  <td>{b.completionDays}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.status === 'EVALUATION' && !t.recommended && edit && <button type="button" className={b.rank === 1 ? 'btn-primary' : 'btn-secondary'} onClick={() => { setNote(''); setDialog({ kind: 'recommend', bid: b }); }}>Recommend</button>}
                    {t.recommended?.bidId === b.id && <span className="badge badge-green">Recommended</span>}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
          {t.status === 'EVALUATION' && t.recommended && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="success">A bid is recommended and waits for the Manager’s sign-off.{t.recommended.note ? ` Reason given: ${t.recommended.note}` : ''}</Notice>
              {approve && <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-primary" onClick={() => run(() => tendersApi.approve(id), 'Awarded. Every bidder has been told.')}>Approve and award</button>
                <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'return' })}>Send back</button></div>}
            </div>
          )}
        </section>
      )}

      {['AWARDED', 'COMPLETED'].includes(t.status) && (
        <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
          <strong>Contract</strong>
          <div style={{ margin: '6px 0 12px', fontSize: 14 }}>{t.contractor?.name} · {tzs(t.contractPrice)}{t.rating != null && <span className="muted"> · rated {t.rating}/5</span>}</div>
          {t.contractor?.payoutMethod && can('tender_payments', 'EDIT') && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Pay to: {t.contractor.payoutMethod.replace('_', ' ').toLowerCase()} {t.contractor.payoutAccount} {t.contractor.payoutName ? `(${t.contractor.payoutName})` : ''}</div>}
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>#</th><th>Milestone</th><th className="num">Amount</th><th>Status</th><th /></tr></thead><tbody>
            {t.milestones.map((m: any) => (
              <tr key={m.id}>
                <td>{m.number}</td>
                <td>{m.title}<div className="muted" style={{ fontSize: 11 }}>{m.percent}%{m.submitNote ? ` · Contractor: ${m.submitNote}` : ''}{m.signOffNote ? ` · Chairman: ${m.signOffNote}` : ''}{m.reworkNote ? ` · Sent back: ${m.reworkNote}` : ''}{m.paidReference ? ` · Ref ${m.paidReference}` : ''}</div>
                  {m.evidenceUrls?.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, marginRight: 8 }}>Photo</a>)}</td>
                <td className="num">{tzs(m.amount)}</td><td><Badge map={MILESTONE} value={m.status} /></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {m.status === 'SIGNED_OFF' && approve && <button type="button" className="btn-primary" onClick={() => run(() => tendersApi.approvePayment(m.id), 'Payment approved. The Accountant can now pay it.')}>Approve payment</button>}
                  {m.status === 'APPROVED' && can('tender_payments', 'EDIT') && <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'pay', milestone: m })}>Record payment</button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
          {t.status === 'COMPLETED' && t.rating == null && approve && <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>Rate the contractor:{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="btn-secondary" onClick={() => run(() => tendersApi.rate(id, n), 'Thank you. The rating counts in their future bids.')}>{n}</button>)}</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Each milestone is inspected and signed off on site by the canal or block chairman before the Manager approves its payment.</div>
        </section>
      )}

      <section className="table-panel" style={{ padding: 18 }}>
        <strong>Record of this tender</strong> <span className="badge badge-gray">Cannot be changed</span>
        <ol style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
          {t.events.map((e: any) => <li key={e.id}><span className="muted">{clock(e.at)}</span> · <strong>{e.kind.replace(/_/g, ' ').toLowerCase()}</strong>{e.detail ? `: ${e.detail}` : ''}</li>)}
        </ol>
      </section>

      {dialog?.kind === 'cancel' && <ConfirmDialog title="Cancel this tender?" danger askReason reasonLabel="Reason (sent to bidders)" confirmLabel="Cancel tender" body={<>Anyone who bid is told it is cancelled.</>}
        onConfirm={async (reason) => { await tendersApi.cancel(id, reason); setMsg({ tone: 'success', text: 'Tender cancelled.' }); reload(); onChanged(); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'return' && <ConfirmDialog title="Send the recommendation back" askReason reasonLabel="Why" confirmLabel="Send back" body={<>The Procurement Officer must choose again.</>}
        onConfirm={async (reason) => { await tendersApi.returnRecommendation(id, reason); setMsg({ tone: 'success', text: 'Sent back.' }); reload(); onChanged(); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'recommend' && (
        <Modal title={`Recommend bid ${dialog.bid.code}`} subtitle={dialog.bid.rank === 1 ? 'This is the top-ranked bid.' : `This bid is ranked ${dialog.bid.rank}, not first.`} onClose={() => setDialog(null)} width="520px"
          footer={<><button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Back</button><button type="button" className="btn-primary" disabled={dialog.bid.rank !== 1 && note.trim().length < 20}
            onClick={async () => { const bid = dialog.bid; setDialog(null); await run(() => tendersApi.recommend(id, bid.id, note.trim() || undefined), 'Recommended. The Manager now reviews and signs off.'); }}>Recommend</button></>}>
          {dialog.bid.rank !== 1 && <Field label="Why not the top-ranked bid? *" hint="At least 20 characters. This is kept in the record."><textarea className="input-field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          {dialog.bid.rank === 1 && <p style={{ fontSize: 14 }}>The Manager must sign off before the contract is awarded.</p>}
        </Modal>
      )}
      {dialog?.kind === 'pay' && <PayDialog milestone={dialog.milestone} onClose={() => setDialog(null)} onDone={(text) => { setDialog(null); setMsg({ tone: 'success', text }); reload(); onChanged(); }} />}
    </div>
  );
}

// ───────────────────────── contractors ─────────────────────────

function Contractors() {
  const can = useCan();
  const [status, setStatus] = useState('PENDING'); const [refresh, setRefresh] = useState(0); const [vet, setVet] = useState<any>(null); const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => tendersApi.contractors({ status }), [status, refresh]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ marginBottom: 10 }}><select className="input-field" style={{ width: 200 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Waiting to be checked</option><option value="VETTED">Approved</option><option value="SUSPENDED">Suspended</option><option value="REJECTED">Rejected</option><option value="ALL">All</option></select></div>
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="No contractors here" hint="Contractors register themselves on the Contractor sign-up page; they appear here to be checked." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Contractor</th><th>Papers</th><th>Capacity</th><th>On MAYOData</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.name}</strong><div className="muted" style={{ fontSize: 11 }}>{c.kind.replace('_', ' ').toLowerCase()} · {c.phone}{c.email ? ` · ${c.email}` : ''}</div></td>
              <td style={{ fontSize: 12.5 }}>{c.tin ? `TIN ${c.tin}` : ''}{c.businessRegNo ? ` · Reg ${c.businessRegNo}` : ''}{c.memberNumber ? `Member ${c.memberNumber}` : ''}</td>
              <td style={{ fontSize: 12.5 }}>{c.equipmentCount} machine(s) · {c.yearsExperience} yrs{c.equipment ? <div className="muted">{c.equipment}</div> : null}</td>
              <td style={{ fontSize: 12.5 }}>{c.completedContracts} finished{c.averageRating != null ? ` · ${Math.round(c.averageRating * 10) / 10}/5` : ''}</td>
              <td><StatusBadge value={c.status} label={c.status === 'VETTED' ? 'Approved' : c.status === 'PENDING' ? 'Waiting' : undefined} />{c.vettingNote && <div className="muted" style={{ fontSize: 11 }}>{c.vettingNote}</div>}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{can('tender_contractors', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setVet(c)}>Decide</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {vet && <VetDialog contractor={vet} onClose={() => setVet(null)} onDone={(t) => { setVet(null); setNotice(t); setRefresh((n) => n + 1); }} />}
    </div>
  );
}

function VetDialog({ contractor, onClose, onDone }: { contractor: any; onClose: () => void; onDone: (t: string) => void }) {
  const [status, setStatus] = useState('VETTED'); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (status !== 'VETTED' && !note.trim()) { setError('Say why, so the contractor knows.'); return; }
    setBusy(true); setError('');
    try { await tendersApi.vet(contractor.id, { status, note: note.trim() || undefined }); onDone(`${contractor.name} is ${status === 'VETTED' ? 'approved' : status === 'REJECTED' ? 'rejected' : 'suspended'}. They have been told.`); }
    catch (e) { setError(errMsg(e, 'Could not save.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={contractor.name} subtitle="Check their papers, then decide." onClose={onClose} width="480px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>Save decision</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Decision"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="VETTED">Approve: may bid</option><option value="REJECTED">Reject</option><option value="SUSPENDED">Suspend</option></select></Field>
        <Field label={status === 'VETTED' ? 'Note (optional)' : 'Reason *'}><textarea className="input-field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ───────────────────────── a chairman's inspections ─────────────────────────

function Inspections() {
  const [refresh, setRefresh] = useState(0); const [action, setAction] = useState<any>(null); const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => tendersApi.inspections(), [refresh]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Work on your canal or block that the contractor says is finished. Go and look, then sign it off or send it back. Only you, as the chairman, can do this; the Manager cannot do it for you.</p>
      {loading && !data ? <TableSkeleton cols={4} rows={3} /> : !rows.length ? <Empty title="Nothing waiting for you" hint="You are told by SMS when a contractor submits a milestone on your canal or block." /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r) => (
            <section key={r.id} className="table-panel" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>{r.reference} · {r.title}</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Milestone {r.number}: {r.milestone}</div>
              <div style={{ fontSize: 13 }}>{r.contractor} says: “{r.submitNote}”</div>
              {r.evidenceUrls?.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 13, marginRight: 8 }}>Photo</a>)}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-primary" onClick={() => setAction({ kind: 'sign', row: r })}>Sign off</button>
                <button type="button" className="btn-secondary" onClick={() => setAction({ kind: 'rework', row: r })}>Send back</button>
              </div>
            </section>
          ))}
        </div>
      )}
      {action && <ConfirmDialog title={action.kind === 'sign' ? 'Sign off this milestone' : 'Send it back'} danger={action.kind === 'rework'} askReason reasonLabel={action.kind === 'sign' ? 'What you inspected' : 'What must be fixed'} confirmLabel={action.kind === 'sign' ? 'Sign off' : 'Send back'}
        body={action.kind === 'sign' ? <>You confirm you inspected this work on site. The Manager then approves the payment.</> : <>The contractor is told and must submit again.</>}
        onConfirm={async (reason) => { if (action.kind === 'sign') await tendersApi.signOff(action.row.id, reason); else await tendersApi.rework(action.row.id, reason); setNotice(action.kind === 'sign' ? 'Signed off.' : 'Sent back to the contractor.'); setRefresh((n) => n + 1); }} onClose={() => setAction(null)} />}
    </div>
  );
}

// ───────────────────────── the page ─────────────────────────

type Tab = 'tenders' | 'contractors' | 'inspections';

/** Infrastructure tenders: publish, sealed bids, anonymous ranking, award by two people, and payment per inspected milestone. */
export default function TendersPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false); const [notice, setNotice] = useState(''); const [refresh, setRefresh] = useState(0); const [status, setStatus] = useState('ALL');
  const tabs: { id: Tab; label: string }[] = [
    ...(can('tenders', 'VIEW') ? [{ id: 'tenders' as Tab, label: 'Tenders' }] : []),
    ...(can('tender_contractors', 'VIEW') ? [{ id: 'contractors' as Tab, label: 'Contractors' }] : []),
    ...(can('tender_milestones', 'VIEW') ? [{ id: 'inspections' as Tab, label: 'My inspections' }] : []),
  ];
  const active: Tab = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? 'tenders';
  const list = useApi<any>(user?.mamcosId && active === 'tenders' && can('tenders', 'VIEW') ? () => tendersApi.list({ status }) : null, [active, refresh, status, user?.mamcosId]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(t); }, [notice]);

  if (!tabs.length) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the tenders permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Tenders" /><Empty title="Tenders belong to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  if (openId) return <TenderDetail id={openId} onBack={() => setOpenId(null)} onChanged={() => setRefresh((n) => n + 1)} />;
  const rows: any[] = list.data?.data ?? [];
  return (
    <div>
      <PageHeader title="Tenders" subtitle="Maintenance work is awarded only through a tender: open to members’ groups and outside contractors, bids sealed until closing, scored without names, awarded by two people, paid per inspected milestone."
        actions={can('tenders', 'CREATE') && active === 'tenders' ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>New tender</button> : undefined} />
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      {tabs.length > 1 && <Tabs tabs={tabs} active={active} onChange={setTab} />}
      <div style={{ marginTop: 14 }}>
        {active === 'contractors' && <Contractors />}
        {active === 'inspections' && <Inspections />}
        {active === 'tenders' && (
          <>
            <LoadError message={list.error} onRetry={list.reload} />
            <div style={{ marginBottom: 10 }}><select className="input-field" style={{ width: 200 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All</option>{Object.entries(STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <section className="table-panel">
              {list.loading && !list.data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="No tenders yet" hint="Publish a tender for canal clearing, desilting, road grading or drainage repair." action={can('tenders', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>New tender</button> : undefined} /> : (
                <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Tender</th><th className="num">Ceiling</th><th>Closes</th><th>Bids</th><th>Status</th><th /></tr></thead><tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.title}</strong><div className="muted" style={{ fontSize: 11 }}>{t.reference} · {CATEGORY[t.category]}</div></td>
                      <td className="num">{tzs(t.budgetCeiling)}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.closesAt)}</td>
                      <td>{t.sealed && t.bids > 0 ? `${t.bids} (sealed)` : t.bids}{t.milestones > 0 && t.contractPrice != null ? <div className="muted" style={{ fontSize: 11 }}>{t.milestonesPaid}/{t.milestones} paid</div> : null}</td>
                      <td><Badge map={STATUS} value={t.status} /></td>
                      <td style={{ textAlign: 'right' }}><button type="button" className="btn-secondary" onClick={() => setOpenId(t.id)}>Open</button></td>
                    </tr>
                  ))}
                </tbody></table></div>
              )}
            </section>
          </>
        )}
      </div>
      {adding && <NewTender onClose={() => setAdding(false)} onDone={(id, text) => { setAdding(false); setNotice(text); setRefresh((n) => n + 1); setOpenId(id); }} />}
    </div>
  );
}
