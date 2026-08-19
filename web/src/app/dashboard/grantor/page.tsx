'use client';

import { useEffect, useState } from 'react';
import { reportsApi } from '@/lib/api';

function money(n: number) {
  return `TZS ${Math.round(n || 0).toLocaleString()}`;
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    keys.join(','),
    ...rows.map((row) => keys.map((k) => escape(row[k] ?? '')).join(',')),
  ].join('\n');
}

export default function GrantorImpactPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsApi
      .impact()
      .then((r) => setData(r.data))
      .catch(() => setError('Unable to load grantor impact report.'))
      .finally(() => setLoading(false));
  }, []);

  const exportJson = () => {
    if (!data) return;
    downloadBlob(
      `mayode-grantor-impact-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
  };

  const exportCsv = () => {
    if (!data) return;
    const summary = [
      {
        metric: 'totalFarmers',
        value: data.totalFarmers ?? 0,
      },
      { metric: 'totalHectares', value: data.totalHectares ?? 0 },
      { metric: 'totalYieldKg', value: data.totalYieldKg ?? 0 },
      {
        metric: 'averageYieldPerHectare',
        value: data.averageYieldPerHectare ?? 0,
      },
      { metric: 'totalRevenue', value: data.totalRevenue ?? 0 },
      {
        metric: 'fairtradePremiumEarned',
        value: data.fairtradePremiumEarned ?? 0,
      },
      { metric: 'membershipCount', value: data.membershipCount ?? 0 },
      {
        metric: 'averageFarmerIncome',
        value: data.averageFarmerIncome ?? 0,
      },
    ];
    const seasons = (data.seasonKpis || []).map((s: any) => ({
      season: s.season,
      cropCycles: s.cropCycles,
      actualYieldKg: s.actualYieldKg,
      estimatedYieldKg: s.estimatedYieldKg,
      farmerIncome: s.farmerIncome,
      farmersWithIncome: s.farmersWithIncome,
    }));
    const income = (data.farmerIncomeOverTime || []).map((r: any) => ({
      period: r.period,
      totalIncome: r.totalIncome,
      farmerCount: r.farmerCount,
      averageFarmerIncome: r.averageFarmerIncome,
    }));
    const body = [
      '# summary',
      toCsv(summary),
      '',
      '# seasonKpis',
      toCsv(seasons),
      '',
      '# farmerIncomeOverTime',
      toCsv(income),
    ].join('\n');
    downloadBlob(
      `mayode-grantor-impact-${new Date().toISOString().slice(0, 10)}.csv`,
      body,
      'text/csv;charset=utf-8',
    );
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Partner / grantor</div>
          <h1 className="page-title">Impact report</h1>
          <p className="page-subtitle">
            Season KPIs, farmer income trends, membership growth, and community
            projects — exportable for donor reporting.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!data}
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!data}
            onClick={exportJson}
          >
            Export JSON
          </button>
        </div>
      </div>

      {error && <div className="alert-box alert-danger">{error}</div>}
      {loading && <p className="muted">Loading impact pack…</p>}

      {data && (
        <>
          <p className="muted" style={{ marginBottom: 16, fontSize: 12 }}>
            Schema {data.schema} · Generated{' '}
            {data.generatedAt
              ? new Date(data.generatedAt).toLocaleString()
              : '—'}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
              gap: 14,
              marginBottom: 20,
            }}
          >
            {[
              ['Farmers', data.totalFarmers],
              ['Hectares', Math.round(data.totalHectares || 0)],
              ['Yield', `${Math.round(data.totalYieldKg || 0).toLocaleString()} kg`],
              ['Avg yield / ha', `${Math.round(data.averageYieldPerHectare || 0)} kg`],
              ['Farmer revenue', money(data.totalRevenue)],
              ['Avg farmer income', money(data.averageFarmerIncome)],
              ['Members', data.membershipCount],
              ['Fairtrade premium', money(data.fairtradePremiumEarned)],
            ].map(([label, value]) => (
              <div key={String(label)} className="stat-card" style={{ padding: 18 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {label}
                </div>
                <strong style={{ display: 'block', fontSize: 20, marginTop: 6 }}>
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <div className="table-panel" style={{ marginBottom: 20 }}>
            <div className="section-toolbar">
              <strong>Season KPIs</strong>
              <span className="muted">
                {(data.seasonKpis || []).length} seasons
              </span>
            </div>
            {!data.seasonKpis?.length ? (
              <p className="muted" style={{ padding: 24 }}>
                No crop-cycle seasons recorded yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Cycles</th>
                      <th>Actual yield</th>
                      <th>Est. yield</th>
                      <th>Farmer income</th>
                      <th>Farmers paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.seasonKpis.map((s: any) => (
                      <tr key={s.season}>
                        <td style={{ fontWeight: 600 }}>{s.season}</td>
                        <td>{s.cropCycles}</td>
                        <td>
                          {Math.round(s.actualYieldKg || 0).toLocaleString()} kg
                        </td>
                        <td>
                          {Math.round(s.estimatedYieldKg || 0).toLocaleString()}{' '}
                          kg
                        </td>
                        <td>{money(s.farmerIncome)}</td>
                        <td>{s.farmersWithIncome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div className="table-panel">
              <div className="section-toolbar">
                <strong>Income over time</strong>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 320 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Income</th>
                      <th>Farmers</th>
                      <th>Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.farmerIncomeOverTime || []).map((row: any) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{money(row.totalIncome)}</td>
                        <td>{row.farmerCount}</td>
                        <td>{money(row.averageFarmerIncome)}</td>
                      </tr>
                    ))}
                    {!data.farmerIncomeOverTime?.length && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No revenue periods yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="table-panel">
              <div className="section-toolbar">
                <strong>Membership growth</strong>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 320 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>New</th>
                      <th>Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.membershipGrowth || []).map((row: any) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{row.newMembers}</td>
                        <td>{row.cumulativeMembers}</td>
                      </tr>
                    ))}
                    {!data.membershipGrowth?.length && (
                      <tr>
                        <td colSpan={3} className="muted">
                          No membership timeline yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="table-panel">
            <div className="section-toolbar">
              <strong>Community projects</strong>
              <span className="muted">{(data.projects || []).length}</span>
            </div>
            {!data.projects?.length ? (
              <p className="muted" style={{ padding: 24 }}>
                No community projects recorded.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Funding</th>
                      <th>Budget</th>
                      <th>Spent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.map((p: any) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{p.fundingSource || '—'}</td>
                        <td>{money(p.budget || 0)}</td>
                        <td>{money(p.spentAmount || 0)}</td>
                        <td>
                          <span className="badge badge-blue">
                            {String(p.status || '').replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
