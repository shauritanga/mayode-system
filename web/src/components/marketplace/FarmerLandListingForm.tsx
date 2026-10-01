'use client';
import { useEffect, useState } from 'react';
import { marketplaceApi } from '@/lib/api';
import { apiError } from '@/lib/download';
import { InsightPanel, money } from '@/components/role-dashboards/DashboardPrimitives';

export default function FarmerLandListingForm({ farms, farmerId, onSubmit }: { farms: any[]; farmerId: string; onSubmit: (data: object) => Promise<void> }) {
  const [farmId, setFarmId] = useState(''); const [asking, setAsking] = useState(''); const [months, setMonths] = useState('12'); const [deal, setDeal] = useState('STANDARD');
  const [code, setCode] = useState(''); const [pricing, setPricing] = useState('fixed'); const [plan, setPlan] = useState('PREPAID'); const [drop, setDrop] = useState(''); const [days, setDays] = useState('');
  const [gauge, setGauge] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; setGauge(null); setError(''); if (!farmId) return;
    const timer = setTimeout(() => { marketplaceApi.getSuggestedPrice(farmId, Number(asking) || undefined).then((r) => { if (active) setGauge(r.data); }).catch((e) => { if (active) setError(apiError(e)); }); }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [farmId, asking]);
  return <InsightPanel title="List my land" subtitle="Set your asking price and rental terms. Ownership and availability are checked before listing."><form className="form-grid" onSubmit={async (e) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await onSubmit({ farmId, ownerId: farmerId, askingPrice: Number(asking), dealType: deal, leaseDurationMonths: Number(months), isFlashDeal: deal === 'FLASH_DEAL', preferredRenterCode: deal === 'RELATIONSHIP' ? code.trim() : undefined, isMultiYear: Number(months) > 12, pricingModel: pricing, paymentPlan: Number(months) > 12 ? plan : 'PREPAID', autoDropPrice: drop ? Number(drop) : undefined, autoDropDays: drop ? Number(days) : undefined }); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }}>
    <label className="form-label">Farm<select className="input-field" required value={farmId} onChange={(e) => setFarmId(e.target.value)}><option value="">Choose a farm you own</option>{farms.filter((f) => f.farmerId === farmerId).map((f) => <option key={f.id} value={f.id}>{f.farmCode} · {f.socialHectares} ha</option>)}</select></label>
    <label className="form-label">Asking price / first year (TZS)<input className="input-field" required type="number" min="1" step="1" value={asking} onChange={(e) => setAsking(e.target.value)} /></label>
    <label className="form-label">Lease duration (months)<input className="input-field" required type="number" min="1" max="60" step="1" value={months} onChange={(e) => setMonths(e.target.value)} /></label>
    <label className="form-label">Deal<select className="input-field" value={deal} onChange={(e) => setDeal(e.target.value)}><option value="STANDARD">Standard</option><option value="FLASH_DEAL">Flash deal</option><option value="RELATIONSHIP">Preferred renter</option></select></label>
    {deal === 'RELATIONSHIP' && <label className="form-label">Preferred renter control number<input className="input-field" required value={code} onChange={(e) => setCode(e.target.value)} /></label>}
    {Number(months) > 12 && <><label className="form-label">Pricing model<select className="input-field" value={pricing} onChange={(e) => setPricing(e.target.value)}><option value="fixed">Fixed annual rent</option><option value="step_up">Annual step-up</option><option value="rice_linked">Rice-linked rent</option></select></label><label className="form-label">Payment plan<select className="input-field" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="PREPAID">Full term upfront</option><option value="ANNUAL">Annual installments</option></select></label></>}
    <label className="form-label">Optional automatic price drop (TZS)<input className="input-field" type="number" min="1" max={Number(asking) || undefined} value={drop} onChange={(e) => setDrop(e.target.value)} /></label>
    {drop && <label className="form-label">Drop after days<input className="input-field" required type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} /></label>}
    {gauge && <p className="form-grid-wide">Suggested rent: <strong>{money(gauge.suggestedPrice)}</strong> · Asking price is {gauge.marketGauge} relative to comparable farms · Grade {gauge.grade}. The suggestion is advisory; you set the price.</p>}
    {error && <p role="alert" className="form-grid-wide">{error}</p>}<button className="btn-primary" disabled={busy || !farmerId}>{busy ? 'Saving…' : 'Create listing'}</button>
  </form></InsightPanel>;
}
