'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cropCyclesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TableSkeleton, MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import CropCycleEditorModal from '@/components/CropCycleEditorModal';
import CropStageStepper from '@/components/CropStageStepper';
import { toCsv } from '@/lib/farm-format';
import {
  CYCLE_STATUSES,
  GROWTH_STAGES,
  IRRIGATION_TYPES,
  PRODUCTION_METHODS,
  fmtDate,
  fmtKg,
  stageIndex,
  stageLabel,
  statusBadgeClass,
} from '@/lib/crop-stages';

const PAGE_SIZE = 15;

interface Filters { search: string; season: string; variety: string; stage: string; status: string; method: string; irrigation: string }
const NO_FILTERS: Filters = { search: '', season: '', variety: '', stage: '', status: '', method: '', irrigation: '' };
const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

export default function CropCyclesPage() {
  const role = useAuthStore((state) => state.user?.role);
  const canStart = role === 'SUPER_ADMIN' || role === 'FIELD_OFFICER';
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState(false);

  const load = () => {
    setLoadError('');
    cropCyclesApi.getAll()
      .then((res) => setCycles(res.data?.data || res.data || []))
      .catch(() => setLoadError('Could not load crop seasons.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const set = (key: keyof Filters, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return cycles.filter((c) => {
      if (q && !`${c.season} ${c.farmer?.firstName} ${c.farmer?.lastName} ${c.farmer?.controlNumber || ''} ${c.farm?.farmCode || ''} ${c.riceVariety || ''}`.toLowerCase().includes(q)) return false;
      if (filters.season && c.season !== filters.season) return false;
      if (filters.variety && c.riceVariety !== filters.variety) return false;
      if (filters.stage) {
        if (filters.stage === 'NONE' ? !!c.growthStage : stageIndex(c.growthStage) !== stageIndex(filters.stage)) return false;
      }
      if (filters.status && c.status !== filters.status) return false;
      if (filters.method && c.productionMethod !== filters.method) return false;
      if (filters.irrigation && c.irrigationType !== filters.irrigation) return false;
      return true;
    });
  }, [cycles, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters = Object.values(filters).some(Boolean);

  const active = cycles.filter((c) => c.status === 'ACTIVE');
  const sum = (rows: any[], key: string) => rows.reduce((s, c) => s + (c[key] || 0), 0);
  const stageCount = (key: string) => cycles.filter((c) => ['ACTIVE', 'PLANNED'].includes(c.status) && stageIndex(c.growthStage) === stageIndex(key)).length;

  const exportCsv = () => {
    const csv = toCsv(
      ['Season', 'Farm', 'Farmer', 'Rice variety', 'Area planted (ha)', 'Seed (kg)', 'Production method', 'Irrigation type', 'Growth stage', 'Planting date', 'Expected harvest', 'Expected yield (kg)', 'Actual yield (kg)', 'Status'],
      filtered.map((c) => [
        c.season, c.farm?.farmCode ?? '', c.farmer ? `${c.farmer.firstName} ${c.farmer.lastName}` : '', c.riceVariety ?? '',
        c.areaPlantedHa ?? '', c.seedQuantityKg ?? '', PRODUCTION_METHODS[c.productionMethod] ?? '', IRRIGATION_TYPES[c.irrigationType] ?? '',
        c.growthStage ? stageLabel(c.growthStage) : '', c.plantingDate?.slice(0, 10) ?? '', c.expectedHarvest?.slice(0, 10) ?? '',
        c.estimatedYieldKg ?? '', c.actualYieldKg ?? '', c.status,
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rice-crop-seasons.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const select = (key: keyof Filters, label: string, options: [string, string][]) => (
    <select className="farmers-select" value={filters[key]} onChange={(e) => set(key, e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  );

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 4, height: 26, background: 'linear-gradient(to bottom, var(--green-600), var(--accent))', borderRadius: 9999 }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Rice Crop Seasons</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginLeft: 14 }}>Every rice crop: variety, area, method, growth stage and yield</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={exportCsv} disabled={loading || filtered.length === 0}>Export CSV</button>
          {canStart && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setStarting(true)}>+ Start crop season</button>}
        </div>
      </div>

      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Crop seasons" value={cycles.length} hint={`${distinct(cycles.map((c) => c.season)).length} seasons`} tone="green" />
        <MetricTile label="Active crops" value={active.length} hint={`${cycles.filter((c) => c.status === 'PLANNED').length} planned`} tone="blue" />
        <MetricTile label="Area planted (active)" value={`${sum(active, 'areaPlantedHa').toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`} hint="Across active crops" tone="purple" />
        <MetricTile label="Expected yield" value={`${Math.round(sum(cycles.filter((c) => ['ACTIVE', 'PLANNED'].includes(c.status)), 'estimatedYieldKg') / 1000).toLocaleString()} t`} hint="Planned + active crops" tone="gold" />
        <MetricTile label="Actual yield" value={`${Math.round(sum(cycles, 'actualYieldKg') / 1000).toLocaleString()} t`} hint="Recorded harvests" tone="green" />
      </div>

      <section className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10 }}>Active and planned crops by growth stage</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {GROWTH_STAGES.map((st, i) => {
            const on = filters.stage === st.key;
            return (
              <button
                key={st.key}
                type="button"
                className="stat-card"
                onClick={() => set('stage', on ? '' : st.key)}
                style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', border: on ? '2px solid var(--accent)' : undefined }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', fontFamily: 'Outfit, sans-serif' }}>{stageCount(st.key)}</div>
                <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{i + 1}. {st.short}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass-card farmers-workspace">
        <div className="farmers-toolbar">
          <div className="farmers-toolbar-main" style={{ flexWrap: 'wrap' }}>
            <div className="farmers-search">
              <input id="crop-cycles-search" type="search" placeholder="Search season, farmer, farm or variety…" value={filters.search} onChange={(e) => set('search', e.target.value)} />
            </div>
            {select('season', 'All seasons', distinct(cycles.map((c) => c.season)).map((x) => [x, x]))}
            {select('variety', 'All varieties', distinct(cycles.map((c) => c.riceVariety)).map((x) => [x, x]))}
            {select('stage', 'All growth stages', [...GROWTH_STAGES.map((g, i) => [g.key, `${i + 1}. ${g.label}`] as [string, string]), ['NONE', 'Not recorded']])}
            {select('status', 'All statuses', CYCLE_STATUSES.map((s) => [s, s.charAt(0) + s.slice(1).toLowerCase()]))}
            {select('method', 'All methods', Object.entries(PRODUCTION_METHODS))}
            {select('irrigation', 'All irrigation types', Object.entries(IRRIGATION_TYPES))}
            {hasFilters && <button type="button" className="farmers-chip-clear" onClick={() => { setFilters(NO_FILTERS); setPage(1); }}>Clear all</button>}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : loadError ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--red-400)', fontSize: 14 }}>{loadError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>{hasFilters ? 'No crop seasons match these filters.' : 'No crop seasons recorded yet.'}</div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Farm / farmer</th>
                  <th>Rice variety</th>
                  <th className="num">Area (ha)</th>
                  <th className="num">Seed (kg)</th>
                  <th>Method</th>
                  <th>Irrigation</th>
                  <th>Growth stage</th>
                  <th>Planting</th>
                  <th>Exp. harvest</th>
                  <th className="num">Exp. yield</th>
                  <th className="num">Actual yield</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}><Link href={`/dashboard/crop-cycles/${c.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{c.season}</Link></td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.farm?.farmCode || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{c.farmer ? `${c.farmer.firstName} ${c.farmer.lastName}` : '—'}</div>
                    </td>
                    <td className="farmers-cell">{c.riceVariety || '—'}</td>
                    <td className="num">{c.areaPlantedHa ?? '—'}</td>
                    <td className="num">{c.seedQuantityKg ?? '—'}</td>
                    <td className="farmers-cell">{PRODUCTION_METHODS[c.productionMethod] || '—'}</td>
                    <td className="farmers-cell">{IRRIGATION_TYPES[c.irrigationType] || '—'}</td>
                    <td><CropStageStepper stage={c.growthStage} compact /></td>
                    <td className="farmers-cell">{fmtDate(c.plantingDate)}</td>
                    <td className="farmers-cell">{fmtDate(c.expectedHarvest)}</td>
                    <td className="num">{fmtKg(c.estimatedYieldKg)}</td>
                    <td className="num" style={{ fontWeight: c.actualYieldKg ? 700 : 400 }}>{fmtKg(c.actualYieldKg)}</td>
                    <td><span className={`badge ${statusBadgeClass(c.status)}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="farmers-footer">
            <span className="farmers-range">
              Showing <strong>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length.toLocaleString()}</strong>
            </span>
            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">‹</button>
                <span className="page-gap">Page {currentPage} of {totalPages}</span>
                <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">›</button>
              </div>
            )}
          </div>
        )}
      </section>

      {starting && <CropCycleEditorModal onClose={() => setStarting(false)} onSaved={() => { setStarting(false); setLoading(true); load(); }} />}
    </div>
  );
}
