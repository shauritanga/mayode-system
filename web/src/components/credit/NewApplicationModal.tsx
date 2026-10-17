'use client';
import { useEffect, useMemo, useState } from 'react';
import { creditApi, farmersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';
import { PURPOSES, tzs } from '@/lib/credit';

interface Lender { id: string; name: string; interestRatePercent: number | null }
interface FarmerOption { id: string; firstName: string; lastName: string; controlNumber: string }

/** Apply for a loan. A farmer applies for themselves; staff pick the farmer. */
export default function NewApplicationModal({ forStaff, onClose, onCreated }: { forStaff: boolean; onClose: () => void; onCreated: () => void }) {
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ farmerId: '', lenderId: '', amountRequested: '', termMonths: '6', purpose: 'SEED_AND_INPUTS', purposeNote: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    creditApi.lenders().then((r) => setLenders(r.data ?? [])).catch(() => setLenders([]));
    if (forStaff) farmersApi.getAllUnpaginated().then((r) => setFarmers(r.data ?? [])).catch(() => setFarmers([]));
  }, [forStaff]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farmers.filter((f) => !q || `${f.firstName} ${f.lastName}`.toLowerCase().includes(q) || (f.controlNumber ?? '').toLowerCase().includes(q)).slice(0, 50);
  }, [farmers, search]);
  const lender = lenders.find((l) => l.id === form.lenderId);
  const amount = Number(form.amountRequested) || 0;
  const term = Number(form.termMonths) || 1;
  const total = Math.round(amount * (1 + ((lender?.interestRatePercent ?? 0) / 100) * (term / 12)));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await creditApi.submit({
        farmerId: forStaff ? form.farmerId : undefined, lenderId: form.lenderId, amountRequested: amount,
        termMonths: term, purpose: form.purpose, purposeNote: form.purposeNote.trim() || undefined,
      });
      onCreated();
    } catch (e) { setError(apiErrorMessage(e, 'Could not send the application.')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Apply for a loan" subtitle="Your farm size, harvests, sales and repayment record are shared with the lender you choose." onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !form.lenderId || amount <= 0 || (forStaff && !form.farmerId)} onClick={submit}>{busy ? 'Sending…' : 'Send application'}</button></>}>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {forStaff && (
          <label className="form-label">Farmer
            <input className="input-field" type="search" placeholder="Search name or control number…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 6 }} />
            <select className="input-field" size={4} value={form.farmerId} onChange={(e) => setForm({ ...form, farmerId: e.target.value })}>
              {shown.map((f) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName} · {f.controlNumber}</option>)}
            </select>
          </label>
        )}
        <label className="form-label">Lender
          <select className="input-field" value={form.lenderId} onChange={(e) => setForm({ ...form, lenderId: e.target.value })}>
            <option value="">Choose a lender…</option>
            {lenders.map((l) => <option key={l.id} value={l.id}>{l.name}{l.interestRatePercent != null ? ` · ${l.interestRatePercent}% a year` : ''}</option>)}
          </select>
          {lenders.length === 0 && <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>No lenders are set up yet.</span>}
        </label>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <label className="form-label">Amount needed (TZS)<input className="input-field" type="number" min={1} value={form.amountRequested} onChange={(e) => setForm({ ...form, amountRequested: e.target.value })} /></label>
          <label className="form-label">Repay over (months)<input className="input-field" type="number" min={1} max={60} value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} /></label>
        </div>
        <label className="form-label">What the money is for
          <select className="input-field" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
            {PURPOSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="form-label">Details (optional)<input className="input-field" value={form.purposeNote} onChange={(e) => setForm({ ...form, purposeNote: e.target.value })} placeholder="e.g. certified seed and fertiliser for 2 hectares" /></label>
        {amount > 0 && form.lenderId && (
          <div className="alert-box alert-success">If approved as asked you would repay about {tzs(total)} in {term} monthly instalments of {tzs(total / term)}. The lender sets the final terms.</div>
        )}
      </div>
    </Modal>
  );
}
