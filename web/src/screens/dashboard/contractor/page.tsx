'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { contractorApi, uploadsApi } from '@/lib/api';
import { Empty, Field, LoadError, Notice, PageHeader, TableSkeleton, Tabs, errMsg, useApi } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const clock = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const CATEGORY: Record<string, string> = { CANAL_CLEARING: 'Canal clearing', DESILTING: 'Desilting', ROAD_GRADING: 'Road grading', DRAINAGE_REPAIR: 'Drainage repair', OTHER: 'Other' };
const MILESTONE: Record<string, [string, string]> = { PENDING: ['Work under way', 'badge-gray'], SUBMITTED: ['Waiting for inspection', 'badge-gold'], SIGNED_OFF: ['Inspected', 'badge-blue'], APPROVED: ['Payment approved', 'badge-blue'], PAID: ['Paid', 'badge-green'] };

async function uploadAll(files: FileList | null): Promise<string[]> {
  if (!files?.length) return [];
  const urls: string[] = [];
  for (const f of Array.from(files).slice(0, 10)) urls.push((await uploadsApi.upload(f)).data.url);
  return urls;
}

function BidDialog({ tender, onClose, onDone }: { tender: any; onClose: () => void; onDone: (t: string) => void }) {
  const mine = tender.myBid;
  const [price, setPrice] = useState(mine ? String(mine.price) : ''); const [proposal, setProposal] = useState(mine?.technicalProposal ?? '');
  const [equipment, setEquipment] = useState(mine ? String(mine.equipmentOffered) : String(tender.requiredEquipment)); const [days, setDays] = useState(mine ? String(mine.completionDays) : '');
  const [files, setFiles] = useState<FileList | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!Number(price) || proposal.trim().length < 20 || !Number(days)) { setError('Enter your price, how many days you need, and describe how you will do the work.'); return; }
    if (Number(price) > tender.budgetCeiling) { setError(`Your price is above the budget ceiling of ${tzs(tender.budgetCeiling)}.`); return; }
    setBusy(true); setError('');
    try {
      const urls = await uploadAll(files);
      await contractorApi.bid(tender.id, { price: Number(price), technicalProposal: proposal.trim(), equipmentOffered: Number(equipment) || 0, completionDays: Number(days), documentUrls: urls.length ? urls : (mine?.documentUrls ?? []) });
      onDone('Your bid is received. It stays sealed until the closing time; you can change it until then.');
    } catch (e) { setError(errMsg(e, 'Could not send your bid.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Bid for ${tender.reference}`} subtitle={tender.title} onClose={onClose} width="600px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Sending…' : mine ? 'Update my bid' : 'Send my bid'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="muted" style={{ fontSize: 13 }}>Budget ceiling {tzs(tender.budgetCeiling)}. Scored on price ({tender.criteria.price}), equipment ({tender.criteria.equipment}), experience ({tender.criteria.experience}) and past performance on MAYOData ({tender.criteria.performance}). Nobody sees your name while the bids are scored.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Your price (TZS) *"><input className="input-field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Machines you offer" hint={`The work needs ${tender.requiredEquipment}`}><input type="number" min={0} className="input-field" value={equipment} onChange={(e) => setEquipment(e.target.value)} /></Field>
          <Field label="Days to finish *"><input type="number" min={1} className="input-field" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        </div>
        <Field label="Technical proposal *" hint="How you will do the work: machines, people, method, timing."><textarea className="input-field" rows={6} maxLength={8000} value={proposal} onChange={(e) => setProposal(e.target.value)} /></Field>
        <Field label="Documents" hint="Optional: your quotation, equipment papers, past work (up to 10 files)."><input type="file" multiple onChange={(e) => setFiles(e.target.files)} /></Field>
      </div>
    </Modal>
  );
}

function OpenTenders({ canBid }: { canBid: boolean }) {
  const [bump, setBump] = useState(0); const [bidding, setBidding] = useState<any>(null); const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => contractorApi.tenders(), [bump]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton cols={4} rows={3} /> : !rows.length ? <Empty title="No tenders are open right now" hint="New tenders are sent to you by SMS when they are published." /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((t) => (
            <section key={t.id} className="table-panel" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><div className="muted" style={{ fontSize: 12 }}>{t.reference} · {t.amcos} · {CATEGORY[t.category]}</div><div style={{ fontWeight: 700, fontSize: 17 }}>{t.title}</div></div>
                {t.myBid && <span className="badge badge-green">Bid sent</span>}</div>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{t.scope}</p>
              <div className="muted" style={{ fontSize: 13 }}>Ceiling <strong>{tzs(t.budgetCeiling)}</strong> · closes {clock(t.closesAt)} · payment in {t.milestones.length} step(s): {t.milestones.map((m: any) => `${m.title} ${m.percent}%`).join(', ')}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button type="button" className="btn-primary" disabled={!canBid || new Date(t.opensAt) > new Date()} title={canBid ? '' : 'You can bid once you are approved'} onClick={() => setBidding(t)}>{t.myBid ? 'Change my bid' : 'Bid'}</button>
                {t.myBid && <button type="button" className="btn-secondary" onClick={async () => { try { await contractorApi.withdraw(t.id); setNotice('Your bid is withdrawn.'); setBump((n) => n + 1); } catch (e) { setNotice(errMsg(e, 'Could not withdraw.')); } }}>Withdraw</button>}
              </div>
            </section>
          ))}
        </div>
      )}
      {bidding && <BidDialog tender={bidding} onClose={() => setBidding(null)} onDone={(t) => { setBidding(null); setNotice(t); setBump((n) => n + 1); }} />}
    </div>
  );
}

function MyBids() {
  const { data, loading, error, reload } = useApi<any>(() => contractorApi.bids(), []);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      <LoadError message={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton cols={4} rows={3} /> : !rows.length ? <Empty title="You have not bid yet" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Tender</th><th className="num">My price</th><th>Bid</th><th>Result</th></tr></thead><tbody>
          {rows.map((b) => <tr key={b.id}><td><strong>{b.tender.title}</strong><div className="muted" style={{ fontSize: 11 }}>{b.tender.reference}</div></td><td className="num">{tzs(b.price)}</td><td>{b.code}{b.status === 'WITHDRAWN' ? ' (withdrawn)' : ''}</td>
            <td>{b.won ? <span className="badge badge-green">Won</span> : b.lost ? <span className="badge badge-gray">Not selected</span> : b.tender.status === 'CANCELLED' ? <span className="badge badge-red">Cancelled</span> : b.tender.status === 'OPEN' ? 'Sealed until ' + clock(b.tender.closesAt) : 'Being evaluated'}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

function SubmitDialog({ milestone, onClose, onDone }: { milestone: any; onClose: () => void; onDone: (t: string) => void }) {
  const [note, setNote] = useState(''); const [files, setFiles] = useState<FileList | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (note.trim().length < 5) { setError('Describe the work you finished.'); return; }
    setBusy(true); setError('');
    try { await contractorApi.submitMilestone(milestone.id, { note: note.trim(), evidenceUrls: await uploadAll(files) }); onDone('Submitted. The canal and block chairmen have been asked to inspect the work.'); }
    catch (e) { setError(errMsg(e, 'Could not submit.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Milestone ${milestone.number}: ${milestone.title}`} subtitle={tzs(milestone.amount)} onClose={onClose} width="520px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Sending…' : 'Submit for inspection'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {milestone.reworkNote && <Notice tone="error">Sent back: {milestone.reworkNote}</Notice>}
        <Field label="What was done *"><textarea className="input-field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Photos" hint="Before and after photos help the chairman."><input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} /></Field>
      </div>
    </Modal>
  );
}

function MyContracts() {
  const [bump, setBump] = useState(0); const [submitting, setSubmitting] = useState<any>(null); const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => contractorApi.contracts(), [bump]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton cols={4} rows={3} /> : !rows.length ? <Empty title="No contracts yet" hint="A tender you win appears here with its payment milestones." /> : rows.map((t) => (
        <section key={t.id} className="table-panel" style={{ padding: 16, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12 }}>{t.reference} · {t.amcos}</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{t.title} <span className="muted" style={{ fontWeight: 400 }}>· {tzs(t.contractPrice)}</span></div>
          <div style={{ overflowX: 'auto', marginTop: 8 }}><table className="data-table"><thead><tr><th>#</th><th>Milestone</th><th className="num">Amount</th><th>Status</th><th /></tr></thead><tbody>
            {t.milestones.map((m: any) => (
              <tr key={m.id}><td>{m.number}</td><td>{m.title}{m.reworkNote && m.status === 'PENDING' ? <div style={{ color: '#b91c1c', fontSize: 12 }}>Sent back: {m.reworkNote}</div> : null}{m.paidReference ? <div className="muted" style={{ fontSize: 11 }}>Paid, ref {m.paidReference}</div> : null}</td>
                <td className="num">{tzs(m.amount)}</td><td><span className={`badge ${MILESTONE[m.status][1]}`}>{MILESTONE[m.status][0]}</span></td>
                <td style={{ textAlign: 'right' }}>{m.status === 'PENDING' && t.status === 'AWARDED' && <button type="button" className="btn-primary" onClick={() => setSubmitting(m)}>Work finished: submit</button>}</td></tr>
            ))}
          </tbody></table></div>
        </section>
      ))}
      {submitting && <SubmitDialog milestone={submitting} onClose={() => setSubmitting(null)} onDone={(t) => { setSubmitting(null); setNotice(t); setBump((n) => n + 1); }} />}
    </div>
  );
}

function Profile({ me, onSaved }: { me: any; onSaved: () => void }) {
  const [f, setF] = useState({ equipment: me.equipment ?? '', equipmentCount: String(me.equipmentCount ?? 0), yearsExperience: String(me.yearsExperience ?? 0), payoutMethod: me.payoutMethod ?? 'MOBILE_MONEY', payoutAccount: me.payoutAccount ?? '', payoutName: me.payoutName ?? '', address: me.address ?? '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const save = async () => {
    try { await contractorApi.update({ equipment: f.equipment, equipmentCount: Number(f.equipmentCount) || 0, yearsExperience: Number(f.yearsExperience) || 0, payoutMethod: f.payoutMethod, payoutAccount: f.payoutAccount, payoutName: f.payoutName, address: f.address }); setMsg({ tone: 'success', text: 'Saved.' }); onSaved(); }
    catch (e) { setMsg({ tone: 'error', text: errMsg(e, 'Could not save.') }); }
  };
  return (
    <section className="table-panel" style={{ padding: 18, display: 'grid', gap: 12, maxWidth: 640 }}>
      {msg && <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Notice>}
      <div className="muted" style={{ fontSize: 13 }}>{me.name} · {me.kind.replace('_', ' ').toLowerCase()} · {me.phone}. Your machines and experience are scored in every bid, so keep them true.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Machines"><input type="number" min={0} className="input-field" value={f.equipmentCount} onChange={(e) => setF({ ...f, equipmentCount: e.target.value })} /></Field>
        <Field label="Years of experience"><input type="number" min={0} className="input-field" value={f.yearsExperience} onChange={(e) => setF({ ...f, yearsExperience: e.target.value })} /></Field>
      </div>
      <Field label="Equipment you own"><textarea className="input-field" rows={3} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} /></Field>
      <Field label="Address"><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Get paid by"><select className="input-field" value={f.payoutMethod} onChange={(e) => setF({ ...f, payoutMethod: e.target.value })}><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank</option></select></Field>
        <Field label="Account / number"><input className="input-field" value={f.payoutAccount} onChange={(e) => setF({ ...f, payoutAccount: e.target.value })} /></Field>
        <Field label="Account name"><input className="input-field" value={f.payoutName} onChange={(e) => setF({ ...f, payoutName: e.target.value })} /></Field>
      </div>
      <div><button type="button" className="btn-primary" onClick={save}>Save</button></div>
    </section>
  );
}

type Tab = 'open' | 'bids' | 'contracts' | 'profile';

/** The contractor's portal: open tenders and bids, the contracts won, and the profile that is scored. */
export default function ContractorPage() {
  const { data: me, loading, error, reload } = useApi<any>(() => contractorApi.me(), []);
  const [tab, setTab] = useState<Tab>('open');
  if (loading && !me) return <TableSkeleton cols={3} rows={3} />;
  if (error || !me) return <><PageHeader title="Contractor portal" /><LoadError message={error || 'This login is not a registered contractor.'} onRetry={reload} /></>;
  const vetted = me.status === 'VETTED';
  return (
    <div>
      <PageHeader title="Contractor portal" subtitle={`${me.name} · ${me.completedContracts} contract(s) finished${me.averageRating != null ? ` · rated ${me.averageRating}/5` : ''}`} />
      {me.status === 'PENDING' && <Notice tone="success">Your registration is being checked by an AMCOS officer. You can look at tenders now and bid once you are approved.</Notice>}
      {(me.status === 'REJECTED' || me.status === 'SUSPENDED') && <Notice tone="error">Your registration was {me.status === 'REJECTED' ? 'not approved' : 'suspended'}.{me.vettingNote ? ` ${me.vettingNote}` : ''}</Notice>}
      <Tabs tabs={[{ id: 'open' as Tab, label: 'Open tenders' }, { id: 'bids' as Tab, label: 'My bids' }, { id: 'contracts' as Tab, label: 'My contracts' }, { id: 'profile' as Tab, label: 'My profile' }]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }}>
        {tab === 'open' && <OpenTenders canBid={vetted} />}
        {tab === 'bids' && <MyBids />}
        {tab === 'contracts' && <MyContracts />}
        {tab === 'profile' && <Profile me={me} onSaved={reload} />}
      </div>
    </div>
  );
}
