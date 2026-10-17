'use client';
import { useEffect, useState } from 'react';
import { insuranceApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';
import { day, tzs } from '@/lib/credit';
import { CLAIM_PAY, productLabel } from '@/lib/insurance';

/* eslint-disable @typescript-eslint/no-explicit-any */
const CLAIM_BADGE: Record<string, string> = { SUBMITTED: 'badge-blue', INSPECTING: 'badge-gold', APPROVED: 'badge-green', REJECTED: 'badge-red', PAID: 'badge-green' };

/** The insurer's claims: read the inspection, approve an amount or reject, then record payments. */
export default function InsurerClaimsPanel() {
  const [claims, setClaims] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<{ claim: any; kind: 'decide' | 'pay' } | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => insuranceApi.deskClaims().then((r) => { setClaims(r.data ?? []); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load claims.'))).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const open = (claim: any, kind: 'decide' | 'pay') => {
    setActive({ claim, kind }); setFormError(''); setNote(''); setRef('');
    setAmount(kind === 'decide' ? String(claim.assessedLossAmount ?? claim.claimedAmount) : String(Math.max((claim.approvedAmount ?? 0) - (claim.paidAmount ?? 0), 0)));
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setFormError('');
    try { await fn(); setActive(null); await load(); } catch (e) { setFormError(apiErrorMessage(e, 'That did not work.')); } finally { setBusy(false); }
  };

  return (
    <div>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="table-panel">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
          : claims.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No claims yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Farmer</th><th>Product</th><th>Incident</th><th>Claimed</th><th>Inspection</th><th>Approved</th><th>Paid</th><th>Status</th><th /></tr></thead>
              <tbody>{claims.map((c) => {
                const [pc, pl] = CLAIM_PAY[c.paymentStatus] ?? ['badge-gray', c.paymentStatus];
                return (
                  <tr key={c.id}>
                    <td>{c.policy?.farmer ? `${c.policy.farmer.firstName} ${c.policy.farmer.lastName}` : '—'}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{c.policy?.farmer?.controlNumber}</div></td>
                    <td>{productLabel(c.policy?.productType)}</td>
                    <td>{c.incidentType}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{day(c.incidentDate)}</div></td>
                    <td>{tzs(c.claimedAmount)}</td>
                    <td style={{ maxWidth: 220 }}>
                      {c.inspectionDate ? <>
                        <div style={{ fontSize: 12 }}>{c.inspectionNotes}</div>
                        <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
                          {c.assessedLossAmount != null && <>Loss {tzs(c.assessedLossAmount)} · </>}{c.recommendation ? `Recommends ${c.recommendation.toLowerCase()}` : ''}
                        </div>
                        {(c.inspectionPhotoUrls ?? []).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>{c.inspectionPhotoUrls.slice(0, 4).map((u: string) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Inspection" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} /></a>
                          ))}</div>
                        )}
                      </> : <span style={{ color: 'var(--neutral-500)' }}>Not inspected</span>}
                    </td>
                    <td>{c.approvedAmount != null ? tzs(c.approvedAmount) : '—'}</td>
                    <td>{c.paidAmount ? tzs(c.paidAmount) : '—'}<div><span className={`badge ${pc}`}>{pl}</span></div></td>
                    <td><span className={`badge ${CLAIM_BADGE[c.status]}`}>{c.status.toLowerCase()}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {['SUBMITTED', 'INSPECTING'].includes(c.status) && <button className="btn-primary" onClick={() => open(c, 'decide')}>Decide</button>}
                      {c.status === 'APPROVED' && <button className="btn-primary" onClick={() => open(c, 'pay')}>Record payment</button>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
      {active && (
        <Modal title={active.kind === 'decide' ? 'Decide the claim' : 'Record a claim payment'} subtitle={`Claimed ${tzs(active.claim.claimedAmount)}${active.kind === 'pay' ? ` · approved ${tzs(active.claim.approvedAmount)} · paid ${tzs(active.claim.paidAmount ?? 0)}` : ''}`} onClose={() => setActive(null)}
          footer={active.kind === 'decide' ? (
            <>
              <button className="btn-secondary" onClick={() => setActive(null)} disabled={busy}>Cancel</button>
              <button className="btn-secondary" style={{ color: 'var(--red-500)' }} disabled={busy || note.trim().length < 3} onClick={() => run(() => insuranceApi.decideClaim(active.claim.id, { decision: 'REJECT', note: note.trim() }))}>Reject (reason needed)</button>
              <button className="btn-primary" disabled={busy || !Number(amount)} onClick={() => run(() => insuranceApi.decideClaim(active.claim.id, { decision: 'APPROVE', approvedAmount: Number(amount), note: note.trim() || undefined }))}>Approve amount</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => setActive(null)} disabled={busy}>Cancel</button>
              <button className="btn-primary" disabled={busy || !Number(amount)} onClick={() => run(() => insuranceApi.updateClaimPayment(active.claim.id, { amount: Number(amount), reference: ref.trim() || undefined }))}>Record payment</button>
            </>
          )}>
          {formError && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="form-label">{active.kind === 'decide' ? 'Amount to approve (TZS)' : 'Amount paid (TZS)'}<input className="input-field" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            {active.kind === 'decide' ? (
              <label className="form-label">Note (needed to reject)<input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            ) : (
              <label className="form-label">Payment reference<input className="input-field" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
