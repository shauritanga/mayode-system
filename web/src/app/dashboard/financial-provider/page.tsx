'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  EmptyState,
  InsightPanel,
  MetricTile,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import { farmersApi } from '@/lib/api';

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function factorsToRows(factors: Record<string, any> | undefined) {
  if (!factors) return [];
  return Object.entries(factors).map(([key, value]) => ({
    key,
    score: value?.score ?? 0,
    max: value?.max ?? 0,
    detail: value,
  }));
}

export default function FinancialProviderDashboardPage() {
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const factorRows = useMemo(
    () => factorsToRows(profile?.credit?.factors),
    [profile],
  );

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
      setError(
        err?.response?.data?.message ||
          'Unable to load this farmer profile. Confirm the farmer ID/control number and consent status.',
      );
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    if (!profile) return;
    const control = profile.farmer?.controlNumber || 'farmer';
    downloadBlob(
      `mayode-credit-${control}.json`,
      JSON.stringify(
        {
          schema: 'mayode.credit-profile.v1',
          exportedAt: new Date().toISOString(),
          ...profile,
        },
        null,
        2,
      ),
      'application/json',
    );
  };

  const exportCsv = () => {
    if (!profile) return;
    const control = profile.farmer?.controlNumber || 'farmer';
    const lines = [
      'section,field,value',
      `farmer,controlNumber,${profile.farmer?.controlNumber || ''}`,
      `farmer,name,"${profile.farmer?.name || ''}"`,
      `farmer,verification,${profile.farmer?.verificationStatus || ''}`,
      `credit,score,${profile.credit?.creditScore ?? ''}`,
      `credit,ready,${profile.credit?.creditReady ?? ''}`,
      `finance,netProfit,${profile.finance?.netProfit ?? ''}`,
      `finance,outstandingLoans,${profile.finance?.totalLoanOutstanding ?? ''}`,
      `production,totalYieldKg,${profile.production?.totalYieldKg ?? ''}`,
      ...factorRows.map(
        (row) => `factor,${row.key},${row.score}/${row.max}`,
      ),
    ];
    downloadBlob(`mayode-credit-${control}.csv`, lines.join('\n'), 'text/csv');
  };

  return (
    <div className="role-dashboard">
      <InsightPanel
        title="Credit profile lookup"
        subtitle="Access farmer financial profiles only where explicit data-sharing consent has been captured."
      >
        <form onSubmit={lookup} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input-field"
            style={{ flex: 1, minWidth: 220 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Farmer ID or control number (e.g. MYD-00006)"
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Load profile'}
          </button>
        </form>
      </InsightPanel>

      {error && <EmptyState>{error}</EmptyState>}
      {!profile && !error && (
        <InsightPanel
          title="How this portal works"
          subtitle="Consent-based sharing with banks and lenders."
        >
          <div className="role-grid">
            <MetricTile
              label="Step 1"
              value="Consent"
              hint="Farmer must grant financial-provider data sharing."
            />
            <MetricTile
              label="Step 2"
              value="Score factors"
              hint="Verification, production, profitability, loans, insurance."
              tone="blue"
            />
            <MetricTile
              label="Step 3"
              value="Export"
              hint="Download JSON or CSV for underwriting files — does not replace lender judgment."
              tone="gold"
            />
          </div>
        </InsightPanel>
      )}

      {profile && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <button type="button" className="btn-secondary" onClick={exportJson}>
              Export JSON
            </button>
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
          </div>

          <div className="role-grid">
            <MetricTile
              label="Credit score"
              value={profile.credit?.creditScore ?? '—'}
              hint={profile.credit?.creditReady ? 'Credit ready' : 'Not yet credit ready'}
              tone={profile.credit?.creditReady ? 'green' : 'gold'}
            />
            <MetricTile
              label="Net farm income"
              value={money(profile.finance?.netProfit)}
              hint="Recorded revenue less costs"
              tone={profile.finance?.netProfit >= 0 ? 'green' : 'red'}
            />
            <MetricTile
              label="Total yield"
              value={`${Math.round(profile.production?.totalYieldKg || 0).toLocaleString()} kg`}
              hint={`${profile.production?.harvestedCycles || 0} harvested cycles`}
              tone="blue"
            />
            <MetricTile
              label="Outstanding loans"
              value={money(profile.finance?.totalLoanOutstanding)}
              hint={`${profile.finance?.activeLoanCount || 0} active loans`}
              tone="red"
            />
          </div>

          <div className="role-two-col">
            <InsightPanel title="Farmer identity" subtitle="Consent-gated borrower context.">
              <div className="role-list">
                <div className="role-list-item">
                  <strong>{profile.farmer?.controlNumber}</strong>
                  <span>{profile.farmer?.verificationStatus}</span>
                </div>
                <div className="role-list-item">
                  <strong>{profile.farmer?.name}</strong>
                  <span>{profile.farmer?.phone}</span>
                </div>
                <div className="role-list-item">
                  <strong>Cooperative</strong>
                  <span>{profile.farmer?.cooperative?.name || 'Not assigned'}</span>
                </div>
                <div className="role-list-item">
                  <strong>Consent</strong>
                  <span className="badge badge-green">Financial sharing allowed</span>
                </div>
              </div>
            </InsightPanel>

            <InsightPanel
              title="Readiness conditions"
              subtitle="Trust conditions made explicit for underwriting."
            >
              <div className="role-list">
                {Object.entries(profile.conditions || {}).map(([key, value]) => (
                  <div className="role-list-item" key={key}>
                    <strong>{key.replace(/([A-Z])/g, ' $1')}</strong>
                    <span className={`badge ${value ? 'badge-green' : 'badge-gold'}`}>
                      {value ? 'Yes' : 'No'}
                    </span>
                  </div>
                ))}
              </div>
            </InsightPanel>
          </div>

          <InsightPanel
            title="Score factor breakdown"
            subtitle="How the 0–100 credit readiness score was composed."
          >
            {factorRows.length === 0 ? (
              <p className="muted">No factor detail on this profile.</p>
            ) : (
              <div className="role-list">
                {factorRows.map((row) => (
                  <div className="role-list-item" key={row.key}>
                    <strong style={{ textTransform: 'capitalize' }}>
                      {row.key.replace(/([A-Z])/g, ' $1')}
                    </strong>
                    <span>
                      <span className="badge badge-blue">
                        {row.score}/{row.max}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </InsightPanel>
        </>
      )}
    </div>
  );
}
