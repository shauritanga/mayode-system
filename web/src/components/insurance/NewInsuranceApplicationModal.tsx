'use client';
import { useEffect, useMemo, useState } from 'react';
import { farmersApi, insuranceApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';
import { tzs } from '@/lib/credit';
import type { RiskInfo } from '@/lib/insurance';
import ProductGuide from './ProductGuide';
import RiskPanel from './RiskPanel';

interface FarmerOption { id: string; firstName: string; lastName: string; controlNumber: string }

/** Apply for crop cover: choose the product, see the risk and a suggested sum insured, send to an insurer. */
export default function NewInsuranceApplicationModal({ forStaff, onClose, onCreated }: { forStaff: boolean; onClose: () => void; onCreated: () => void }) {
  const [insurers, setInsurers] = useState<{ id: string; name: string }[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ farmerId: '', providerId: '', productType: 'MULTI_PERIL', insuredAreaHectares: '', riceVariety: '', requestedSumInsured: '', notes: '' });
  const [risk, setRisk] = useState<RiskInfo | null>(null);
  const [hint, setHint] = useState<{ suggestedSumInsured: number | null; basis: string | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    insuranceApi.insurers().then((r) => setInsurers(r.data ?? [])).catch(() => setInsurers([]));
    if (forStaff) farmersApi.getAllUnpaginated().then((r) => setFarmers(r.data ?? [])).catch(() => setFarmers([]));
  }, [forStaff]);

  const ready = !forStaff || !!form.farmerId;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    insuranceApi.risk({ farmerId: form.farmerId || undefined }).then((r) => { if (live) setRisk(r.data); }).catch(() => { if (live) setRisk(null); });
    return () => { live = false; };
  }, [ready, form.farmerId]);

  const area = Number(form.insuredAreaHectares) || 0;
  useEffect(() => {
    if (!ready || area <= 0) return;
    let live = true;
    const t = setTimeout(() => {
      insuranceApi.suggestion({ farmerId: form.farmerId || undefined, product: form.productType, areaHa: area })
        .then((r) => { if (live) setHint(r.data); }).catch(() => { if (live) setHint(null); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [ready, form.farmerId, form.productType, area]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farmers.filter((f) => !q || `${f.firstName} ${f.lastName}`.toLowerCase().includes(q) || (f.controlNumber ?? '').toLowerCase().includes(q)).slice(0, 50);
  }, [farmers, search]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await insuranceApi.submitApplication({
        farmerId: forStaff ? form.farmerId : undefined, providerId: form.providerId, productType: form.productType,
        insuredAreaHectares: area, riceVariety: form.riceVariety.trim() || undefined,
        requestedSumInsured: Number(form.requestedSumInsured) || undefined, notes: form.notes.trim() || undefined,
      });
      onCreated();
    } catch (e) { setError(apiErrorMessage(e, 'Could not send the application.')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Apply for crop insurance" subtitle="The insurance company decides and quotes the premium. Cover starts when the premium is paid at your cooperative." width="720px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !form.providerId || area <= 0 || (forStaff && !form.farmerId)} onClick={submit}>{busy ? 'Sending…' : 'Send application'}</button></>}>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 14 }}>
        {forStaff && (
          <label className="form-label">Farmer
            <input className="input-field" type="search" placeholder="Search name or control number…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 6 }} />
            <select className="input-field" size={4} value={form.farmerId} onChange={(e) => setForm({ ...form, farmerId: e.target.value })}>
              {shown.map((f) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName} · {f.controlNumber}</option>)}
            </select>
          </label>
        )}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Choose the cover</div>
          <ProductGuide selected={form.productType} onPick={(k) => setForm({ ...form, productType: k })} />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label className="form-label">Insurance company
            <select className="input-field" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
              <option value="">Choose…</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {insurers.length === 0 && <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>No insurance companies are set up yet.</span>}
          </label>
          <label className="form-label">Area to insure (hectares)<input className="input-field" type="number" min={0.01} step="0.1" value={form.insuredAreaHectares} onChange={(e) => setForm({ ...form, insuredAreaHectares: e.target.value })} /></label>
          <label className="form-label">Rice variety<input className="input-field" value={form.riceVariety} onChange={(e) => setForm({ ...form, riceVariety: e.target.value })} /></label>
          <label className="form-label">Cover you would like (TZS)
            <input className="input-field" type="number" min={0} value={form.requestedSumInsured} onChange={(e) => setForm({ ...form, requestedSumInsured: e.target.value })} />
            {hint?.suggestedSumInsured != null && (
              <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginTop: 4 }} onClick={() => setForm({ ...form, requestedSumInsured: String(hint.suggestedSumInsured) })}>
                Suggested {tzs(hint.suggestedSumInsured)} — use
              </button>
            )}
            {hint?.basis && <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{hint.basis}</span>}
          </label>
        </div>
        <label className="form-label">Anything the insurer should know (optional)<input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <RiskPanel risk={risk} />
      </div>
    </Modal>
  );
}
