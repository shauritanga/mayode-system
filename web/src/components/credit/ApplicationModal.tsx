'use client';
import { useCallback, useEffect, useState } from 'react';
import { creditApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';
import { INSTALMENT, STATUS, day, purposeLabel, tzs, type Application } from '@/lib/credit';
import CreditProfileView from './CreditProfileView';

type Mode = 'lender' | 'applicant';

/** One application: its terms, the credit profile, repayment schedule, and (for the lender) the decision buttons. */
export default function ApplicationModal({ id, mode, onClose, onChanged }: { id: string; mode: Mode; onClose: () => void; onChanged: () => void }) {
  const [a, setA] = useState<Application | null>(null);
  const [tab, setTab] = useState<'terms' | 'profile' | 'schedule'>('terms');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | 'disburse' | null>(null);
  const [form, setForm] = useState({ amount: '', term: '', rate: '', deduct: '50', note: '', reference: '', date: new Date().toISOString().slice(0, 10) });

  const load = useCallback(() => creditApi.application(id).then((r) => {
    const app = r.data as Application;
    setA(app);
    setForm((f) => ({ ...f, amount: f.amount || String(app.approvedAmount ?? app.amountRequested), term: f.term || String(app.termMonths), rate: f.rate || String(app.terms.ratePercent) }));
  }).catch((e) => setError(apiErrorMessage(e, 'Could not load this application.'))), [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); setAction(null); await load(); onChanged(); }
    catch (e) { setError(apiErrorMessage(e, 'That did not work.')); }
    finally { setBusy(false); }
  };

  if (!a) return <Modal title="Loan application" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{error ? <div className="alert-box alert-danger">{error}</div> : 'Loading…'}</Modal>;
  const [cls, label] = STATUS[a.status] ?? ['badge-gray', a.status];
  const open = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(a.status);
  const estTerms = (() => {
    const amt = Number(form.amount) || 0, term = Number(form.term) || 1, rate = Number(form.rate) || 0;
    const total = Math.round(amt * (1 + (rate / 100) * (term / 12)));
    return { total, instalment: Math.round(total / term) };
  })();

  return (
    <Modal
      title={`${a.reference} · ${a.farmerName}`}
      subtitle={`${a.lender.name} · ${tzs(a.amountRequested)} over ${a.termMonths} months`}
      width="760px"
      onClose={onClose}
      footer={
        mode === 'lender' && !action ? (
          <>
            {a.status === 'SUBMITTED' && <button className="btn-secondary" disabled={busy} onClick={() => run(() => creditApi.review(a.id))}>Start review</button>}
            {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(a.status) && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => setAction('reject')}>Reject</button>}
            {['SUBMITTED', 'UNDER_REVIEW'].includes(a.status) && <button className="btn-primary" onClick={() => setAction('approve')}>Approve…</button>}
            {a.status === 'APPROVED' && <button className="btn-primary" onClick={() => setAction('disburse')}>Record disbursement…</button>}
            {!open && <button className="btn-secondary" onClick={onClose}>Close</button>}
          </>
        ) : mode === 'applicant' && open && !action ? (
          <>
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-secondary" style={{ color: 'var(--red-500)' }} disabled={busy} onClick={() => { if (window.confirm('Withdraw this application?')) run(() => creditApi.withdraw(a.id)); }}>Withdraw application</button>
          </>
        ) : action ? (
          <>
            <button className="btn-secondary" onClick={() => setAction(null)} disabled={busy}>Back</button>
            {action === 'approve' && <button className="btn-primary" disabled={busy || !Number(form.amount)} onClick={() => run(() => creditApi.approve(a.id, { approvedAmount: Number(form.amount), termMonths: Number(form.term), interestRatePercent: Number(form.rate), autoDeductPercent: Number(form.deduct), note: form.note || undefined }))}>Approve application</button>}
            {action === 'reject' && <button className="btn-primary" disabled={busy || form.note.trim().length < 3} onClick={() => run(() => creditApi.reject(a.id, form.note.trim()))}>Reject application</button>}
            {action === 'disburse' && <button className="btn-primary" disabled={busy} onClick={() => run(() => creditApi.disburse(a.id, { amount: Number(form.amount) || undefined, disbursedAt: form.date ? new Date(form.date).toISOString() : undefined, reference: form.reference || undefined }))}>Confirm money released</button>}
          </>
        ) : <button className="btn-secondary" onClick={onClose}>Close</button>
      }
    >
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span className={`badge ${cls}`}>{label}</span>
        {a.creditScore != null && <span className="badge badge-gray">Score {a.creditScore}/100</span>}
        {a.submittedOnBehalf && <span className="badge badge-gray">Applied by staff</span>}
      </div>

      {action ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {action === 'approve' && <>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <label className="form-label">Amount approved (TZS)<input className="input-field" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
              <label className="form-label">Term (months)<input className="input-field" type="number" min={1} max={60} value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></label>
              <label className="form-label">Interest (% per year)<input className="input-field" type="number" min={0} step="0.1" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></label>
              <label className="form-label">Deduct from sale payouts (%)<input className="input-field" type="number" min={0} max={100} value={form.deduct} onChange={(e) => setForm({ ...form, deduct: e.target.value })} /></label>
            </div>
            <div className="alert-box alert-success">Farmer repays {tzs(estTerms.total)} in {form.term} monthly instalments of about {tzs(estTerms.instalment)} (flat interest).</div>
          </>}
          {action === 'reject' && <p style={{ fontSize: 13, margin: 0 }}>The farmer is told by SMS. Give a short reason they can act on.</p>}
          {action === 'disburse' && <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label className="form-label">Amount released (TZS)<input className="input-field" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className="form-label">Date<input className="input-field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="form-label">Payment reference<input className="input-field" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
          </div>}
          {action !== 'disburse' && <label className="form-label">{action === 'reject' ? 'Reason' : 'Note to the farmer (optional)'}<input className="input-field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>}
        </div>
      ) : (
        <>
          <div className="seg-control" style={{ marginBottom: 12 }}>
            {(['terms', 'profile', 'schedule'] as const).filter((t) => t !== 'schedule' || a.schedule).map((t) => (
              <button key={t} className={`seg-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'terms' ? 'Application' : t === 'profile' ? 'Credit profile' : 'Repayments'}</button>
            ))}
          </div>
          {tab === 'terms' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                {[
                  ['Amount requested', tzs(a.amountRequested)], ['Purpose', purposeLabel(a.purpose)], ['Term', `${a.termMonths} months`],
                  ['Lender', a.lender.name], ['Interest (per year)', `${a.terms.ratePercent}%`], ['Applied', day(a.createdAt)],
                  ...(a.approvedAmount ? [['Approved', tzs(a.approvedAmount)]] : []),
                  [a.status === 'DISBURSED' ? 'Total to repay' : 'Total to repay (indicative)', tzs(a.terms.totalRepayable)],
                  [a.status === 'DISBURSED' ? 'Monthly instalment' : 'Monthly instalment (indicative)', tzs(a.terms.instalment)],
                  ...(a.autoDeductPercent != null ? [['Deducted from sale payouts', `${a.autoDeductPercent}%`]] : []),
                  ...(a.disbursedAt ? [['Released', `${tzs(a.disbursedAmount)} on ${day(a.disbursedAt)}`], ['Payment reference', a.disbursementRef ?? '—']] : []),
                ].map(([k, v]) => <div key={k as string}><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>)}
              </div>
              {a.purposeNote && <p style={{ fontSize: 13 }}><strong>Details:</strong> {a.purposeNote}</p>}
              {a.decisionNote && <p style={{ fontSize: 13 }}><strong>Lender’s note:</strong> {a.decisionNote}</p>}
            </div>
          )}
          {tab === 'profile' && <CreditProfileView applicationId={a.id} />}
          {tab === 'schedule' && a.schedule && (
            <div>
              {a.loan && <p style={{ fontSize: 13, margin: '0 0 8px' }}>Outstanding <strong>{tzs(a.loan.amountOwed)}</strong> of {tzs(a.loan.originalAmount)}{a.schedule.overdueCount > 0 && <> · <span style={{ color: 'var(--red-500)' }}>{tzs(a.schedule.overdueAmount)} overdue</span></>}</p>}
              <table className="data-table"><thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>{a.schedule.rows.map((r) => {
                  const [c, l] = INSTALMENT[r.status];
                  return <tr key={r.number}><td>{r.number}</td><td>{day(r.dueDate)}</td><td>{tzs(r.amount)}</td><td>{tzs(r.paidAmount)}</td><td>{tzs(r.balance)}</td><td><span className={`badge ${c}`}>{l}</span></td></tr>;
                })}</tbody></table>
              <p style={{ fontSize: 11, color: 'var(--neutral-500)' }}>Repayments are taken from the farmer’s sale payouts and applied to the earliest instalment first.</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
