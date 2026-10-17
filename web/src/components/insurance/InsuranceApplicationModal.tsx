'use client';
import { useCallback, useEffect, useState } from 'react';
import { insuranceApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';
import { day, tzs } from '@/lib/credit';
import { APP_STATUS, productLabel, type InsApplication } from '@/lib/insurance';
import RiskPanel from './RiskPanel';

type Mode = 'insurer' | 'staff' | 'farmer';

/** One application: the risk picture, the insurer's offer, and the next step for whoever is looking. */
export default function InsuranceApplicationModal({ id, mode, onClose, onChanged }: { id: string; mode: Mode; onClose: () => void; onChanged: () => void }) {
  const [a, setA] = useState<InsApplication | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | 'premium' | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ sum: '', premium: '', start: today, end: '', note: '', paid: '', ref: '', paidAt: today });

  const load = useCallback(() => insuranceApi.application(id).then((r) => {
    const app = r.data as InsApplication;
    setA(app);
    setF((x) => ({ ...x, sum: x.sum || String(app.sumInsured ?? app.requestedSumInsured ?? ''), premium: x.premium || String(app.premiumAmount ?? ''), paid: x.paid || String(app.premiumAmount ?? ''), start: app.startDate?.slice(0, 10) ?? x.start, end: app.endDate?.slice(0, 10) ?? x.end }));
  }).catch((e) => setError(apiErrorMessage(e, 'Could not load this application.'))), [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); setAction(null); await load(); onChanged(); }
    catch (e) { setError(apiErrorMessage(e, 'That did not work.')); }
    finally { setBusy(false); }
  };

  if (!a) return <Modal title="Insurance application" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{error ? <div className="alert-box alert-danger">{error}</div> : 'Loading…'}</Modal>;
  const [cls, label] = APP_STATUS[a.status] ?? ['badge-gray', a.status];
  const open = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(a.status);
  const rate = f.sum && f.premium ? Math.round((Number(f.premium) / Number(f.sum)) * 1000) / 10 : null;

  return (
    <Modal title={`${a.reference} · ${a.farmerName}`} subtitle={`${a.provider.name} · ${productLabel(a.productType)}`} width="720px" onClose={onClose}
      footer={
        action ? (
          <>
            <button className="btn-secondary" disabled={busy} onClick={() => setAction(null)}>Back</button>
            {action === 'approve' && <button className="btn-primary" disabled={busy || !Number(f.sum) || !f.premium || !f.end} onClick={() => run(() => insuranceApi.approveApplication(a.id, { sumInsured: Number(f.sum), premiumAmount: Number(f.premium), startDate: new Date(f.start).toISOString(), endDate: new Date(f.end).toISOString(), note: f.note || undefined }))}>Send offer</button>}
            {action === 'reject' && <button className="btn-primary" disabled={busy || f.note.trim().length < 3} onClick={() => run(() => insuranceApi.rejectApplication(a.id, f.note.trim()))}>Reject application</button>}
            {action === 'premium' && <button className="btn-primary" disabled={busy || !Number(f.paid)} onClick={() => run(() => insuranceApi.recordApplicationPremium(a.id, { amount: Number(f.paid), reference: f.ref || undefined, paidAt: new Date(f.paidAt).toISOString() }))}>Record premium and start cover</button>}
          </>
        ) : mode === 'insurer' ? (
          <>
            {a.status === 'SUBMITTED' && <button className="btn-secondary" disabled={busy} onClick={() => run(() => insuranceApi.reviewApplication(a.id))}>Start review</button>}
            {open && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => setAction('reject')}>Reject</button>}
            {['SUBMITTED', 'UNDER_REVIEW'].includes(a.status) && <button className="btn-primary" onClick={() => setAction('approve')}>Make an offer…</button>}
            {!open && <button className="btn-secondary" onClick={onClose}>Close</button>}
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>Close</button>
            {open && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} disabled={busy} onClick={() => { if (window.confirm('Withdraw this application?')) run(() => insuranceApi.withdrawApplication(a.id)); }}>Withdraw</button>}
            {mode === 'staff' && a.status === 'APPROVED' && <button className="btn-primary" onClick={() => setAction('premium')}>Record premium paid…</button>}
          </>
        )
      }>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className={`badge ${cls}`}>{label}</span>
        {a.submittedOnBehalf && <span className="badge badge-gray">Applied by staff</span>}
      </div>

      {action === 'approve' && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 12 }}>
          <label className="form-label">Sum insured (TZS)<input className="input-field" type="number" value={f.sum} onChange={(e) => setF({ ...f, sum: e.target.value })} /></label>
          <label className="form-label">Premium (TZS)<input className="input-field" type="number" value={f.premium} onChange={(e) => setF({ ...f, premium: e.target.value })} />{rate != null && <span style={{ fontSize: 11 }}>{rate}% of the cover</span>}</label>
          <label className="form-label">Cover starts<input className="input-field" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="form-label">Cover ends<input className="input-field" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
          <label className="form-label" style={{ gridColumn: '1 / -1' }}>Note to the farmer (optional)<input className="input-field" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
      )}
      {action === 'reject' && <label className="form-label" style={{ marginBottom: 12 }}>Reason<input className="input-field" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>}
      {action === 'premium' && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 12 }}>
          <label className="form-label">Amount collected (TZS)<input className="input-field" type="number" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} /><span style={{ fontSize: 11 }}>Premium due {tzs(a.premiumAmount)}</span></label>
          <label className="form-label">Date<input className="input-field" type="date" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></label>
          <label className="form-label">Receipt / reference<input className="input-field" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></label>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[
          ['Product', productLabel(a.productType)], ['Area to insure', `${a.insuredAreaHectares} ha`], ['Rice variety', a.riceVariety ?? '—'],
          ['Cover asked for', tzs(a.requestedSumInsured)], ['Applied', day(a.createdAt)], ['Farmer', `${a.farmer.controlNumber}${a.farmer.village ? ` · ${a.farmer.village}` : ''}`],
          ...(a.sumInsured != null ? [['Sum insured (offer)', tzs(a.sumInsured)], ['Premium (offer)', tzs(a.premiumAmount)], ['Cover period', `${day(a.startDate)} – ${day(a.endDate)}`]] : []),
          ...(a.premiumPaidAt ? [['Premium received', `${tzs(a.premiumPaidAmount)} on ${day(a.premiumPaidAt)}`], ['Receipt', a.premiumReference ?? '—']] : []),
        ].map(([k, v]) => <div key={k}><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>)}
      </div>
      {a.notes && <p style={{ fontSize: 13 }}><strong>Applicant’s note:</strong> {a.notes}</p>}
      {a.decisionNote && <p style={{ fontSize: 13 }}><strong>Insurer’s note:</strong> {a.decisionNote}</p>}
      {a.status === 'APPROVED' && mode !== 'insurer' && <div className="alert-box alert-success" style={{ marginBottom: 12 }}>Offer made. The premium of {tzs(a.premiumAmount)} is paid at the cooperative office; cover starts once it is recorded.</div>}
      <RiskPanel risk={a.riskSnapshot} />
    </Modal>
  );
}
