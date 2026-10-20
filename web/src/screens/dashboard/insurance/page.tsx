'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { Fragment, useEffect, useState } from 'react';
import { insuranceApi, farmersApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { CLAIM_PAY } from '@/lib/insurance';
import InsuranceApplicationsPanel from '@/components/insurance/InsuranceApplicationsPanel';
import ProductGuide from '@/components/insurance/ProductGuide';
import ClaimInspectModal from '@/components/insurance/ClaimInspectModal';
import { MetricTile, toneFromColor } from '@/components/role-dashboards/DashboardPrimitives';

interface Provider { id: string; name: string; contactPerson?: string; phone?: string; email?: string; _count?: { policies: number } }
interface Policy {
  id: string;
  productType: string;
  status: string;
  riceVariety?: string;
  insuredAreaHectares: number;
  sumInsured: number;
  premiumAmount: number;
  premiumPaidAmount: number;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  provider?: { name: string };
  _count?: { claims: number };
}
interface Claim {
  id: string;
  incidentType: string;
  claimedAmount: number;
  paidAmount?: number | null;
  approvedAmount?: number | null;
  paymentStatus?: string;
  status: string;
  createdAt?: string;
  inspectionDate?: string | null;
  inspectionNotes?: string | null;
  paidAt?: string | null;
  policy?: { farmer?: { firstName: string; lastName: string; controlNumber: string }; provider?: { name: string } };
}

const EMPTY_PROVIDER = { name: '', contactPerson: '', phone: '', email: '' };
const EMPTY_POLICY = { farmerId: '', providerId: '', productType: 'WEATHER_INDEX', riceVariety: '', insuredAreaHectares: '', sumInsured: '', premiumAmount: '' };
const EMPTY_CLAIM = { policyId: '', incidentDate: '', incidentType: '', description: '', claimedAmount: '' };

function PoliciesAndClaims() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [farmers, setFarmers] = useState<{ id: string; firstName: string; lastName: string; controlNumber: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<any>({ ...EMPTY_PROVIDER });
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState<any>({ ...EMPTY_POLICY });
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState<any>({ ...EMPTY_CLAIM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [weatherContext, setWeatherContext] = useState<Record<string, any>>({});
  const [weatherLoadingId, setWeatherLoadingId] = useState<string | null>(null);
  const [policyFilter, setPolicyFilter] = useState<'all' | string>('all');
  const [claimFilter, setClaimFilter] = useState<'all' | string>('all');
  const [timelineOpen, setTimelineOpen] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      insuranceApi.getProviders(),
      insuranceApi.getPolicies(),
      insuranceApi.getClaims(),
      farmersApi.getAllUnpaginated(),
    ]).then(([providerRes, policyRes, claimRes, farmerRes]) => {
      if (providerRes.status === 'fulfilled') setProviders(providerRes.value.data || []);
      if (policyRes.status === 'fulfilled') setPolicies(policyRes.value.data || []);
      if (claimRes.status === 'fulfilled') setClaims(claimRes.value.data || []);
      if (farmerRes.status === 'fulfilled') setFarmers(farmerRes.value.data || []);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const totalSumInsured = policies.reduce((sum, p) => sum + (p.sumInsured || 0), 0);
  const activePolicies = policies.filter((p) => p.status === 'ACTIVE').length;
  const pendingClaims = claims.filter((c) => c.status === 'SUBMITTED' || c.status === 'INSPECTING').length;
  const filteredPolicies = policies.filter((p) => policyFilter === 'all' || p.status === policyFilter);
  const filteredClaims = claims.filter((c) => claimFilter === 'all' || c.status === claimFilter);

  const claimSteps = (claim: Claim) => {
    const status = claim.status;
    return [
      { key: 'SUBMITTED', label: 'Submitted', reached: true, at: claim.createdAt },
      {
        key: 'INSPECTING',
        label: 'Inspecting',
        reached: ['INSPECTING', 'APPROVED', 'REJECTED', 'PAID'].includes(status),
        at: claim.inspectionDate,
        note: claim.inspectionNotes,
      },
      {
        key: 'DECISION',
        label: status === 'REJECTED' ? 'Rejected' : 'Approved',
        reached: ['APPROVED', 'REJECTED', 'PAID'].includes(status),
      },
      {
        key: 'PAID',
        label: 'Paid',
        reached: status === 'PAID',
        at: claim.paidAt,
        note: claim.paidAmount != null ? `TZS ${claim.paidAmount.toLocaleString()}` : null,
      },
    ];
  };

  const submitProvider = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await insuranceApi.createProvider(providerForm);
      setShowProviderForm(false);
      setProviderForm({ ...EMPTY_PROVIDER });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not create provider.');
    } finally { setSaving(false); }
  };

  const submitPolicy = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await insuranceApi.createPolicy({
        ...policyForm,
        insuredAreaHectares: Number(policyForm.insuredAreaHectares),
        sumInsured: Number(policyForm.sumInsured),
        premiumAmount: Number(policyForm.premiumAmount),
        startDate: policyForm.startDate ? new Date(policyForm.startDate).toISOString() : undefined,
        endDate: policyForm.endDate ? new Date(policyForm.endDate).toISOString() : undefined,
      });
      setShowPolicyForm(false);
      setPolicyForm({ ...EMPTY_POLICY });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not create policy.');
    } finally { setSaving(false); }
  };

  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  const handlePolicyStatus = async (id: string, status: string) => {
    setStatusSavingId(id);
    try {
      await insuranceApi.updatePolicyStatus(id, status);
      setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    } catch (e) { console.error(e); } finally { setStatusSavingId(null); }
  };

  const handleRenewPolicy = async (policy: Policy) => {
    const startDate = window.prompt('New policy start date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!startDate) return;
    try {
      await insuranceApi.renewPolicy(policy.id, { startDate: new Date(startDate).toISOString() });
      load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not renew policy.'); }
  };

  const handleAmendPolicy = async (policy: Policy) => {
    const sumInsured = window.prompt('New sum insured (TZS):', String(policy.sumInsured));
    if (sumInsured == null) return;
    const premiumAmount = window.prompt('New premium amount (TZS):', String(policy.premiumAmount));
    if (premiumAmount == null) return;
    try {
      await insuranceApi.amendPolicy(policy.id, { sumInsured: Number(sumInsured), premiumAmount: Number(premiumAmount) });
      load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not amend policy.'); }
  };

  const toggleWeatherContext = async (claimId: string) => {
    if (weatherContext[claimId]) {
      setWeatherContext((prev) => { const next = { ...prev }; delete next[claimId]; return next; });
      return;
    }
    setWeatherLoadingId(claimId);
    try {
      const res = await insuranceApi.getWeatherContextForClaim(claimId);
      setWeatherContext((prev) => ({ ...prev, [claimId]: res.data }));
    } catch (e) { console.error(e); } finally { setWeatherLoadingId(null); }
  };

  const [inspecting, setInspecting] = useState<Claim | null>(null);
  const [premiumFor, setPremiumFor] = useState<Policy | null>(null);

  const submitClaim = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await insuranceApi.createClaim({ ...claimForm, claimedAmount: Number(claimForm.claimedAmount) });
      setShowClaimForm(false);
      setClaimForm({ ...EMPTY_CLAIM });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not file claim.');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Agricultural Insurance</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Crop insurance policies, providers, and claims</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active policies', value: activePolicies, color: 'var(--accent)' },
          { label: 'Total sum insured', value: `TZS ${totalSumInsured.toLocaleString()}`, color: 'var(--gold-400)' },
          { label: 'Pending claims', value: pendingClaims, color: 'var(--red-400)' },
          { label: 'Providers', value: providers.length, color: 'var(--purple-500)' },
        ].map((s) => (
          <MetricTile key={s.label} label={s.label} value={s.value} tone={toneFromColor(s.color)} />
        ))}
      </div>

      {error && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--red-400)' }}>{error}</div>}

      <div className="glass-card" style={{ overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Insurance Providers</span>
          <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 10px' }} onClick={() => setShowProviderForm(true)}>+ Add Provider</button>
        </div>
        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : providers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No insurance providers registered yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Policies</th></tr></thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '13px' }}>{p.contactPerson || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neutral-400)' }}>{p.phone || '—'}</td>
                    <td>{p._count?.policies ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Policies</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input-field" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }} value={policyFilter} onChange={(e) => setPolicyFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 10px' }} onClick={() => setShowPolicyForm(true)}>+ Register Policy</button>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : filteredPolicies.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No policies match this filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Farmer</th><th>Provider</th><th>Product</th><th>Area (ha)</th><th>Sum Insured</th><th>Premium</th><th>Premium paid</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredPolicies.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{p.farmer ? `${p.farmer.firstName} ${p.farmer.lastName}` : '—'}</td>
                    <td style={{ fontSize: '13px', color: 'var(--neutral-400)' }}>{p.provider?.name || '—'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{p.productType.replace(/_/g, ' ')}</td>
                    <td>{p.insuredAreaHectares}</td>
                    <td>TZS {p.sumInsured.toLocaleString()}</td>
                    <td>TZS {p.premiumAmount.toLocaleString()}</td>
                    <td>{p.premiumPaidAmount >= p.premiumAmount ? <span className="badge badge-green">Paid</span> : p.premiumPaidAmount > 0 ? <span className="badge badge-blue">TZS {p.premiumPaidAmount.toLocaleString()}</span> : <span className="badge badge-gold">Unpaid</span>}</td>
                    <td>
                      <select
                        className="input-field"
                        style={{ fontSize: '12px', padding: '4px 6px' }}
                        value={p.status}
                        disabled={statusSavingId === p.id}
                        onChange={(e) => handlePolicyStatus(p.id, e.target.value)}
                      >
                        {['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {p.premiumPaidAmount < p.premiumAmount && <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => setPremiumFor(p)}>Record premium</button>}
                      <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => handleAmendPolicy(p)}>Amend</button>
                      <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => handleRenewPolicy(p)}>Renew</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Claims</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input-field" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }} value={claimFilter} onChange={(e) => setClaimFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {['SUBMITTED', 'INSPECTING', 'APPROVED', 'REJECTED', 'PAID'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 10px' }} onClick={() => setShowClaimForm(true)}>+ File Claim</button>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : filteredClaims.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No claims match this filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Farmer</th><th>Provider</th><th>Incident</th><th>Claimed</th><th>Approved</th><th>Paid</th><th>Status</th><th>Ops</th></tr></thead>
              <tbody>
                {filteredClaims.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{c.policy?.farmer ? `${c.policy.farmer.firstName} ${c.policy.farmer.lastName}` : '—'}</td>
                      <td style={{ fontSize: '13px', color: 'var(--neutral-400)' }}>{c.policy?.provider?.name || '—'}</td>
                      <td style={{ fontSize: '13px', color: 'var(--neutral-400)' }}>{c.incidentType}</td>
                      <td>TZS {c.claimedAmount.toLocaleString()}</td>
                      <td>{c.approvedAmount != null ? `TZS ${c.approvedAmount.toLocaleString()}` : '—'}</td>
                      <td>{c.paidAmount ? `TZS ${c.paidAmount.toLocaleString()}` : '—'}{c.paymentStatus && c.paymentStatus !== 'NOT_DUE' && <div><span className={`badge ${CLAIM_PAY[c.paymentStatus]?.[0] ?? 'badge-gray'}`}>{CLAIM_PAY[c.paymentStatus]?.[1] ?? c.paymentStatus}</span></div>}</td>
                      <td><span className={`badge ${c.status === 'REJECTED' ? 'badge-red' : c.status === 'PAID' || c.status === 'APPROVED' ? 'badge-green' : c.status === 'INSPECTING' ? 'badge-gold' : 'badge-blue'}`}>{c.status.toLowerCase()}</span></td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} disabled={statusSavingId === c.id} onClick={() => setInspecting(c)}>
                          {c.inspectionDate ? 'Update inspection' : 'Inspect'}
                        </button>
                        <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => setTimelineOpen((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}>
                          {timelineOpen[c.id] ? 'Hide timeline' : 'Timeline'}
                        </button>
                        <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} disabled={weatherLoadingId === c.id} onClick={() => toggleWeatherContext(c.id)}>
                          {weatherLoadingId === c.id ? 'Loading…' : weatherContext[c.id] ? 'Hide weather' : 'Weather'}
                        </button>
                      </td>
                    </tr>
                    {timelineOpen[c.id] && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--surface-tint)', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {claimSteps(c).map((step) => (
                              <div key={step.key} style={{ minWidth: 120, padding: 10, borderRadius: 10, background: step.reached ? 'rgba(16,185,129,0.12)' : 'transparent', border: '1px solid var(--hover-tint-3)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: step.reached ? 'var(--accent)' : 'var(--neutral-500)' }}>{step.label}</div>
                                {step.at && <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginTop: 4 }}>{new Date(step.at).toLocaleDateString('en-TZ')}</div>}
                                {step.note && <div style={{ fontSize: 11, color: 'var(--neutral-400)', marginTop: 4 }}>{step.note}</div>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {weatherContext[c.id] && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--surface-tint)', padding: '12px 16px', fontSize: '12px', color: 'var(--neutral-400)' }}>
                          {weatherContext[c.id].matchingAlerts.length === 0
                            ? `No weather alerts recorded within 14 days of the incident for ${weatherContext[c.id].farmerLocation.region || weatherContext[c.id].farmerLocation.district || 'this farmer\'s location'}.`
                            : <div style={{ display: 'grid', gap: 6 }}>
                                {weatherContext[c.id].matchingAlerts.map((a: any) => (
                                  <div key={a.id}>
                                    <span className="badge badge-gold" style={{ marginRight: 8 }}>{a.alertType.replace(/_/g, ' ')}</span>
                                    {a.title} — {new Date(a.validFrom).toLocaleDateString()} ({a.region || a.district})
                                  </div>
                                ))}
                              </div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showProviderForm && (
        <Modal
          title="Add Insurance Provider"
          onClose={() => setShowProviderForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowProviderForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submitProvider} disabled={saving}>{saving ? 'Saving…' : 'Add provider'}</button>
          </>}
        >
          <form onSubmit={submitProvider} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="Provider name" required value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} />
            <input className="input-field" placeholder="Contact person" value={providerForm.contactPerson} onChange={(e) => setProviderForm({ ...providerForm, contactPerson: e.target.value })} />
            <input className="input-field" placeholder="Phone" value={providerForm.phone} onChange={(e) => setProviderForm({ ...providerForm, phone: e.target.value })} />
            <input className="input-field" placeholder="Email" type="email" value={providerForm.email} onChange={(e) => setProviderForm({ ...providerForm, email: e.target.value })} />
          </form>
        </Modal>
      )}

      {showPolicyForm && (
        <Modal
          title="Register Insurance Policy"
          onClose={() => setShowPolicyForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowPolicyForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submitPolicy} disabled={saving}>{saving ? 'Saving…' : 'Register policy'}</button>
          </>}
        >
          <form onSubmit={submitPolicy} style={{ display: 'grid', gap: '9px' }}>
            <select className="input-field" required value={policyForm.farmerId} onChange={(e) => setPolicyForm({ ...policyForm, farmerId: e.target.value })}>
              <option value="">Select farmer…</option>
              {farmers.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName} ({f.controlNumber})</option>)}
            </select>
            <select className="input-field" required value={policyForm.providerId} onChange={(e) => setPolicyForm({ ...policyForm, providerId: e.target.value })}>
              <option value="">Select provider…</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="input-field" value={policyForm.productType} onChange={(e) => setPolicyForm({ ...policyForm, productType: e.target.value })}>
              <option value="AREA_YIELD">Area-yield insurance</option>
              <option value="WEATHER_INDEX">Weather-index insurance</option>
              <option value="MULTI_PERIL">Multi-peril crop insurance</option>
              <option value="INPUT_INSURANCE">Input insurance</option>
              <option value="CREDIT_LINKED">Credit-linked crop insurance</option>
            </select>
            <input className="input-field" placeholder="Rice variety" value={policyForm.riceVariety} onChange={(e) => setPolicyForm({ ...policyForm, riceVariety: e.target.value })} />
            <input className="input-field" type="number" step="0.1" placeholder="Insured area (hectares)" required value={policyForm.insuredAreaHectares} onChange={(e) => setPolicyForm({ ...policyForm, insuredAreaHectares: e.target.value })} />
            <input className="input-field" type="number" placeholder="Sum insured (TZS)" required value={policyForm.sumInsured} onChange={(e) => setPolicyForm({ ...policyForm, sumInsured: e.target.value })} />
            <input className="input-field" type="number" placeholder="Premium amount (TZS)" required value={policyForm.premiumAmount} onChange={(e) => setPolicyForm({ ...policyForm, premiumAmount: e.target.value })} />
            <input className="input-field" type="date" placeholder="Start date" value={policyForm.startDate || ''} onChange={(e) => setPolicyForm({ ...policyForm, startDate: e.target.value })} />
            <input className="input-field" type="date" placeholder="End date" value={policyForm.endDate || ''} onChange={(e) => setPolicyForm({ ...policyForm, endDate: e.target.value })} />
          </form>
        </Modal>
      )}

      {showClaimForm && (
        <Modal
          title="File Insurance Claim"
          onClose={() => setShowClaimForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowClaimForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submitClaim} disabled={saving}>{saving ? 'Saving…' : 'File claim'}</button>
          </>}
        >
          <form onSubmit={submitClaim} style={{ display: 'grid', gap: '9px' }}>
            <select className="input-field" required value={claimForm.policyId} onChange={(e) => setClaimForm({ ...claimForm, policyId: e.target.value })}>
              <option value="">Select policy…</option>
              {policies.filter((p) => p.status === 'ACTIVE').map((p) => (
                <option key={p.id} value={p.id}>{p.farmer ? `${p.farmer.firstName} ${p.farmer.lastName}` : p.id} — {p.productType.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input className="input-field" type="date" required value={claimForm.incidentDate} onChange={(e) => setClaimForm({ ...claimForm, incidentDate: e.target.value })} />
            <input className="input-field" placeholder="Incident type (flood, drought, pest…)" required value={claimForm.incidentType} onChange={(e) => setClaimForm({ ...claimForm, incidentType: e.target.value })} />
            <textarea className="input-field" placeholder="Description" value={claimForm.description} onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })} />
            <input className="input-field" type="number" placeholder="Claimed amount (TZS)" required value={claimForm.claimedAmount} onChange={(e) => setClaimForm({ ...claimForm, claimedAmount: e.target.value })} />
          </form>
        </Modal>
      )}
      {inspecting && <ClaimInspectModal claim={inspecting as any} onClose={() => setInspecting(null)} onSaved={() => { setInspecting(null); load(); }} />}
      {premiumFor && <PolicyPremiumModal policy={premiumFor} onClose={() => setPremiumFor(null)} onSaved={() => { setPremiumFor(null); load(); }} />}
    </div>
  );
}

function PolicyPremiumModal({ policy, onClose, onSaved }: { policy: Policy; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(Math.max(policy.premiumAmount - policy.premiumPaidAmount, 0)));
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await insuranceApi.recordPolicyPremium(policy.id, { amount: Number(amount), reference: reference.trim() || undefined }); onSaved(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not record the premium.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Record premium paid" subtitle={`Premium due TZS ${policy.premiumAmount.toLocaleString()} · paid so far TZS ${policy.premiumPaidAmount.toLocaleString()}`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || !Number(amount)}>{busy ? 'Saving…' : 'Record'}</button></>}>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <label className="form-label">Amount collected (TZS)<input className="input-field" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="form-label">Receipt / reference<input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

export default function InsurancePage() {
  const user = useAuthStore((st) => st.user);
  const canApply = hasPermission(user, 'insurance', 'CREATE');
  const [tab, setTab] = useState<'applications' | 'policies' | 'products'>('applications');
  return (
    <div className="page-shell">
      <div className="seg-control" style={{ marginBottom: 16 }} role="tablist">
        {([['applications', 'Applications'], ['policies', 'Policies and claims'], ['products', 'Products']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`seg-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'applications' && <InsuranceApplicationsPanel mode="staff" canApply={canApply} />}
      {tab === 'policies' && <PoliciesAndClaims />}
      {tab === 'products' && <ProductGuide />}
    </div>
  );
}
