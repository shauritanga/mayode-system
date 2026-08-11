'use client';
import { useState } from 'react';
import { reportsApi } from '@/lib/api';

interface ReportDef {
  key: string;
  path: string;
  title: string;
  subtitle: string;
  formats: ('csv' | 'xlsx' | 'pdf')[];
}

const REPORTS: ReportDef[] = [
  { key: 'farmer-payments', path: '/reports/farmer-payments', title: 'Farmer payments', subtitle: 'Payments, loan deductions and net amounts per farmer.', formats: ['csv', 'xlsx', 'pdf'] },
  { key: 'premium-fund', path: '/reports/premium-fund', title: 'Fairtrade premium fund', subtitle: 'Income/expense ledger with running balance.', formats: ['csv', 'xlsx', 'pdf'] },
  { key: 'farmers', path: '/reports/farmers', title: 'Farmers', subtitle: 'Registered farmer directory export.', formats: ['csv', 'xlsx', 'pdf'] },
  { key: 'crop-cycles', path: '/reports/crop-cycles', title: 'Crop cycles', subtitle: 'Seasonal production records export.', formats: ['csv', 'xlsx', 'pdf'] },
  { key: 'field-officer-performance', path: '/reports/field-officer-performance', title: 'Field officer performance', subtitle: 'Visits, farms mapped, farmers verified, activities logged per officer.', formats: ['csv', 'xlsx', 'pdf'] },
  { key: 'insurance-coverage', path: '/reports/insurance-coverage', title: 'Insurance coverage', subtitle: 'Policies and claims by status and product type.', formats: ['csv', 'xlsx', 'pdf'] },
  { key: 'gender-youth-inclusion', path: '/reports/gender-youth-inclusion', title: 'Gender & youth inclusion', subtitle: 'Farmer breakdown by gender and youth (≤35) status.', formats: ['csv', 'xlsx', 'pdf'] },
];

export default function ReportsPage() {
  const [filters, setFilters] = useState({
    from: '', to: '', region: '', district: '', ward: '', village: '',
    mamcosId: '', fieldOfficerId: '', season: '', riceVariety: '', gender: '', youthOnly: false,
  });
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const activeParams = () => {
    const params: Record<string, string | boolean> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === false) return;
      params[key] = value;
    });
    return params;
  };

  const download = async (report: ReportDef, format: 'csv' | 'xlsx' | 'pdf') => {
    const id = `${report.key}:${format}`;
    setDownloading(id);
    setError('');
    try {
      const res = await reportsApi.download(report.path, { ...activeParams(), format });
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${report.key}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.response?.data?.message || `Unable to download ${report.title}.`);
    } finally {
      setDownloading(null);
    }
  };

  const setFilter = (key: string, value: string | boolean) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Analytics</div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Filter by region, cooperative, officer, season, variety, gender or youth status, then export any report as CSV, Excel or PDF.</p>
        </div>
      </div>

      {error && <div className="alert-box alert-danger">{error}</div>}

      <div className="action-panel">
        <div className="panel-header"><h2 className="panel-title">Filters</h2></div>
        <div className="form-grid-wide">
          <label className="form-label">From<input className="input-field" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label>
          <label className="form-label">To<input className="input-field" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
          <label className="form-label">Region<input className="input-field" value={filters.region} onChange={(e) => setFilter('region', e.target.value)} /></label>
          <label className="form-label">District<input className="input-field" value={filters.district} onChange={(e) => setFilter('district', e.target.value)} /></label>
          <label className="form-label">Ward<input className="input-field" value={filters.ward} onChange={(e) => setFilter('ward', e.target.value)} /></label>
          <label className="form-label">Village<input className="input-field" value={filters.village} onChange={(e) => setFilter('village', e.target.value)} /></label>
          <label className="form-label">Cooperative (AMCOS ID)<input className="input-field" value={filters.mamcosId} onChange={(e) => setFilter('mamcosId', e.target.value)} /></label>
          <label className="form-label">Field officer ID<input className="input-field" value={filters.fieldOfficerId} onChange={(e) => setFilter('fieldOfficerId', e.target.value)} /></label>
          <label className="form-label">Season<input className="input-field" value={filters.season} onChange={(e) => setFilter('season', e.target.value)} /></label>
          <label className="form-label">Rice variety<input className="input-field" value={filters.riceVariety} onChange={(e) => setFilter('riceVariety', e.target.value)} /></label>
          <label className="form-label">Gender<select className="input-field" value={filters.gender} onChange={(e) => setFilter('gender', e.target.value)}>
            <option value="">Any</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select></label>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={filters.youthOnly} onChange={(e) => setFilter('youthOnly', e.target.checked)} /> Youth only ({'≤35'})
          </label>
        </div>
      </div>

      <div className="role-two-col">
        {REPORTS.map((report) => (
          <div key={report.key} className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>{report.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginBottom: 14 }}>{report.subtitle}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {report.formats.map((format) => (
                <button
                  key={format}
                  className="btn-secondary"
                  disabled={downloading === `${report.key}:${format}`}
                  onClick={() => download(report, format)}
                >
                  {downloading === `${report.key}:${format}` ? 'Downloading…' : format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
