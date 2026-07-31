'use client';

import { FormEvent, useState } from 'react';
import {
  EmptyState,
  InsightPanel,
  MetricTile,
  RoleHero,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import { farmersApi } from '@/lib/api';

export default function FinancialProviderDashboardPage() {
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setProfile(null);
    setLoading(true);
    try {
      let farmerId = query.trim();
      if (!farmerId) return;
      if (!farmerId.includes('-') || farmerId.startsWith('MYD') || farmerId.startsWith('QA')) {
        const farmer = await farmersApi.getByControlNumber(farmerId);
        farmerId = farmer.data.id;
      }
      const result = await farmersApi.financialProfile(farmerId);
      setProfile(result.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to load this farmer profile. Confirm the farmer ID/control number and consent status.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="role-dashboard">
    <RoleHero
      eyebrow="Financial provider"
      title="Credit Profile Review"
      subtitle="Access farmer financial profiles only where explicit data-sharing consent has been captured."
    >
      <form onSubmit={lookup} style={{ display: 'grid', gap: 10 }}>
        <input className="input-field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Farmer ID or control number" />
        <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Checking…' : 'Load profile'}</button>
      </form>
    </RoleHero>

    {error && <EmptyState>{error}</EmptyState>}
    {!profile && !error && <InsightPanel title="How this portal works" subtitle="The proposal requires consent-based sharing with banks/lenders.">
      <div className="role-grid">
        <MetricTile label="Step 1" value="Consent" hint="Farmer must grant financial-provider data sharing." />
        <MetricTile label="Step 2" value="Track record" hint="Production, costs, payments and loan history are reviewed." tone="blue" />
        <MetricTile label="Step 3" value="Decision" hint="Credit readiness supports but does not replace lender underwriting." tone="gold" />
      </div>
    </InsightPanel>}

    {profile && <>
      <div className="role-grid">
        <MetricTile label="Credit score" value={profile.credit?.creditScore ?? '—'} hint={profile.credit?.creditReady ? 'Credit ready' : 'Not yet credit ready'} tone={profile.credit?.creditReady ? 'green' : 'gold'} />
        <MetricTile label="Net farm income" value={money(profile.finance?.netProfit)} hint="Recorded revenue less costs" tone={profile.finance?.netProfit >= 0 ? 'green' : 'red'} />
        <MetricTile label="Total yield" value={`${Math.round(profile.production?.totalYieldKg || 0).toLocaleString()} kg`} hint={`${profile.production?.harvestedCycles || 0} harvested cycles`} tone="blue" />
        <MetricTile label="Outstanding loans" value={money(profile.finance?.totalLoanOutstanding)} hint={`${profile.finance?.activeLoanCount || 0} active loans`} tone="red" />
      </div>

      <div className="role-two-col">
        <InsightPanel title="Farmer identity" subtitle="Consent-gated borrower context.">
          <div className="role-list">
            <div className="role-list-item"><strong>{profile.farmer?.controlNumber}</strong><span>{profile.farmer?.verificationStatus}</span></div>
            <div className="role-list-item"><strong>{profile.farmer?.name}</strong><span>{profile.farmer?.phone}</span></div>
            <div className="role-list-item"><strong>Cooperative</strong><span>{profile.farmer?.cooperative?.name || 'Not assigned'}</span></div>
            <div className="role-list-item"><strong>Consent</strong><span className="badge badge-green">Financial sharing allowed</span></div>
          </div>
        </InsightPanel>

        <InsightPanel title="Readiness conditions" subtitle="The proposal’s trust conditions made explicit.">
          <div className="role-list">
            {Object.entries(profile.conditions || {}).map(([key, value]) => <div className="role-list-item" key={key}>
              <strong>{key.replace(/([A-Z])/g, ' $1')}</strong>
              <span className={`badge ${value ? 'badge-green' : 'badge-gold'}`}>{value ? 'Yes' : 'No'}</span>
            </div>)}
          </div>
        </InsightPanel>
      </div>
    </>}
  </div>;
}
