'use client';
import { useEffect, useMemo, useState } from 'react';
import { reportsApi } from '@/lib/api';
import { ChartCard, HorizontalBarChart } from '@/components/role-dashboards/Charts';

type ColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date';
type FilterKey =
  | 'dateRange' | 'region' | 'district' | 'ward' | 'village' | 'mamcos'
  | 'officer' | 'season' | 'variety' | 'gender' | 'youth';
type Format = 'csv' | 'xlsx' | 'pdf';

interface CatalogEntry {
  key: string;
  title: string;
  description: string;
  group: string;
  filters: FilterKey[];
}
interface Report {
  key: string;
  title: string;
  description: string;
  generatedAt: string;
  truncated: boolean;
  summary: { label: string; value: number | string; type?: ColumnType }[];
  columns: { key: string; label: string; type?: ColumnType }[];
  rows: Record<string, unknown>[];
  chart?: { title: string; type?: ColumnType; items: { name: string; value: number }[] };
}
interface Place { region: string | null; district: string | null; ward: string | null; village: string | null }
interface Options {
  places: Place[];
  cooperatives: { id: string; name: string }[];
  officers: { id: string; name: string }[];
  seasons: string[];
  varieties: string[];
}

const EMPTY = {
  from: '', to: '', region: '', district: '', ward: '', village: '',
  mamcosId: '', fieldOfficerId: '', season: '', riceVariety: '', gender: '', youthOnly: false,
};
type Filters = typeof EMPTY;

const GROUP_ORDER = ['Farmers & land', 'Production', 'Trade & finance', 'Inclusion'];
const PAGE_SIZE = 25;
const FORMATS: { id: Format; label: string }[] = [
  { id: 'xlsx', label: 'Excel' },
  { id: 'pdf', label: 'PDF' },
  { id: 'csv', label: 'CSV' },
];

const num = (n: number) => n.toLocaleString();
function formatValue(value: unknown, type: ColumnType = 'text'): string {
  if (value === '' || value === null || value === undefined) return '—';
  if (type === 'currency' && typeof value === 'number') return `TZS ${num(Math.round(value))}`;
  if (type === 'percent' && typeof value === 'number') return `${value}%`;
  if (type === 'number' && typeof value === 'number') return num(value);
  if (type === 'date' && typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return String(value).replace(/_/g, ' ');
}

async function blobError(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string | string[] };
      return Array.isArray(parsed.message) ? parsed.message.join(', ') : (parsed.message ?? fallback);
    } catch { return fallback; }
  }
  const msg = (data as { message?: string | string[] } | undefined)?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? fallback);
}

const unique = (items: (string | null)[]) =>
  [...new Set(items.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

export default function StandardReports() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [active, setActive] = useState('farmer-registration');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState<Format | null>(null);

  useEffect(() => {
    reportsApi.catalog().then((r) => setCatalog(r.data as CatalogEntry[])).catch(() => setError('Could not load the report list.'));
    reportsApi.filterOptions().then((r) => setOptions(r.data as Options)).catch(() => setOptions(null));
  }, []);

  const entry = catalog.find((c) => c.key === active);
  const supports = (k: FilterKey) => !!entry?.filters.includes(k);

  const params = useMemo(() => {
    const out: Record<string, string | boolean> = {};
    const allowed = entry?.filters ?? [];
    const take = (k: FilterKey, ...keys: (keyof Filters)[]) => {
      if (!allowed.includes(k)) return;
      for (const key of keys) if (filters[key] !== '' && filters[key] !== false) out[key] = filters[key];
    };
    take('dateRange', 'from', 'to');
    take('region', 'region'); take('district', 'district'); take('ward', 'ward'); take('village', 'village');
    take('mamcos', 'mamcosId'); take('officer', 'fieldOfficerId'); take('season', 'season');
    take('variety', 'riceVariety'); take('gender', 'gender'); take('youth', 'youthOnly');
    return out;
  }, [filters, entry]);

  // Re-run when the report or any applicable filter changes (debounced).
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      reportsApi.analytics(active, params)
        .then((r) => { if (!cancelled) { setReport(r.data as Report); setError(''); setPage(0); } })
        .catch(async (e) => { if (!cancelled) setError(await blobError(e, 'Could not run this report.')); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, params, entry]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((cur) => {
      const next = { ...cur, [key]: value };
      // Changing a place level clears the levels below it.
      if (key === 'region') { next.district = ''; next.ward = ''; next.village = ''; }
      if (key === 'district') { next.ward = ''; next.village = ''; }
      if (key === 'ward') next.village = '';
      return next;
    });

  const places = options?.places ?? [];
  const regionOptions = unique(places.map((p) => p.region));
  const districtOptions = unique(places.filter((p) => !filters.region || p.region === filters.region).map((p) => p.district));
  const wardOptions = unique(places.filter((p) => (!filters.region || p.region === filters.region) && (!filters.district || p.district === filters.district)).map((p) => p.ward));
  const villageOptions = unique(places.filter((p) => (!filters.district || p.district === filters.district) && (!filters.ward || p.ward === filters.ward)).map((p) => p.village));

  const activeFilterCount = Object.keys(params).length;
  const rows = report?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportReport = async (format: Format) => {
    setExporting(format);
    try {
      const res = await reportsApi.downloadAnalytics(active, { ...params, format });
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${active}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(await blobError(e, `Could not export ${format.toUpperCase()}.`));
    } finally {
      setExporting(null);
    }
  };

  const select = (label: string, value: string, onChange: (v: string) => void, items: { value: string; label: string }[], anyLabel = 'All') => (
    <label className="form-label" key={label}>
      {label}
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{anyLabel}</option>
        {items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
      </select>
    </label>
  );
  const asItems = (list: string[]) => list.map((v) => ({ value: v, label: v }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 250px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }} className="std-reports-grid">
      <aside className="glass-card" style={{ padding: 12, position: 'sticky', top: 12 }}>
        {GROUP_ORDER.map((group) => {
          const items = catalog.filter((c) => c.group === group);
          if (!items.length) return null;
          return (
            <div key={group} style={{ marginBottom: 10 }}>
              <div className="builder-section-title" style={{ margin: '6px 8px' }}>{group}</div>
              {items.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActive(c.key)}
                  aria-current={active === c.key ? 'page' : undefined}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active === c.key ? 700 : 500,
                    background: active === c.key ? 'var(--accent-soft, rgba(34,139,34,0.12))' : 'transparent',
                    color: active === c.key ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  {c.title}
                </button>
              ))}
            </div>
          );
        })}
      </aside>

      <section style={{ minWidth: 0 }}>
        {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif' }}>{entry?.title ?? 'Report'}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{entry?.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '7px 12px' }}
                disabled={!!exporting || loading || !rows.length}
                onClick={() => exportReport(f.id)}
              >
                {exporting === f.id ? 'Preparing…' : f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {supports('dateRange') && (
              <>
                <label className="form-label">From<input type="date" className="input-field" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label>
                <label className="form-label">To<input type="date" className="input-field" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
              </>
            )}
            {supports('region') && select('Region', filters.region, (v) => setFilter('region', v), asItems(regionOptions))}
            {supports('district') && select('District', filters.district, (v) => setFilter('district', v), asItems(districtOptions))}
            {supports('ward') && select('Ward', filters.ward, (v) => setFilter('ward', v), asItems(wardOptions))}
            {supports('village') && select('Village', filters.village, (v) => setFilter('village', v), asItems(villageOptions))}
            {supports('mamcos') && (options?.cooperatives.length ?? 0) > 1 &&
              select('Cooperative', filters.mamcosId, (v) => setFilter('mamcosId', v), (options?.cooperatives ?? []).map((c) => ({ value: c.id, label: c.name })))}
            {supports('officer') && select('Field officer', filters.fieldOfficerId, (v) => setFilter('fieldOfficerId', v), (options?.officers ?? []).map((o) => ({ value: o.id, label: o.name })))}
            {supports('season') && select('Rice season', filters.season, (v) => setFilter('season', v), asItems(options?.seasons ?? []))}
            {supports('variety') && select('Rice variety', filters.riceVariety, (v) => setFilter('riceVariety', v), asItems(options?.varieties ?? []))}
            {supports('gender') && select('Gender', filters.gender, (v) => setFilter('gender', v), [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }])}
            {supports('youth') && (
              <label className="form-label" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 8 }}>
                <input type="checkbox" checked={filters.youthOnly} onChange={(e) => setFilter('youthOnly', e.target.checked)} /> Youth only (≤35)
              </label>
            )}
          </div>
          {activeFilterCount > 0 && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-3)' }}>
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setFilters(EMPTY)}>Clear all</button>
            </div>
          )}
          {entry && entry.filters.length < 11 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
              Filters that do not apply to this report are hidden.
            </div>
          )}
        </div>

        {loading && !report ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Running report…</div>
        ) : report && (
          <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 120ms' }}>
            <div className="metric-grid" style={{ marginBottom: 16 }}>
              {report.summary.map((s) => (
                <div key={s.label} className="stat-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-1)' }}>
                    {formatValue(s.value, s.type)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {report.chart && report.chart.items.some((i) => i.value > 0) && (
              <div style={{ marginBottom: 16 }}>
                <ChartCard title={report.chart.title}>
                  <HorizontalBarChart data={report.chart.items} color="var(--green-500)" height={Math.max(160, report.chart.items.length * 34)} />
                </ChartCard>
              </div>
            )}

            <div className="table-panel">
              {rows.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                  No records match these filters.
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          {report.columns.map((c) => (
                            <th key={c.key} style={{ textAlign: c.type === 'number' || c.type === 'currency' || c.type === 'percent' ? 'right' : 'left' }}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((row, i) => (
                          <tr key={page * PAGE_SIZE + i}>
                            {report.columns.map((c) => {
                              const numeric = c.type === 'number' || c.type === 'currency' || c.type === 'percent';
                              return (
                                <td key={c.key} style={{ whiteSpace: 'nowrap', textAlign: numeric ? 'right' : 'left', fontVariantNumeric: numeric ? 'tabular-nums' : undefined }}>
                                  {formatValue(row[c.key], c.type)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-3)' }}>
                    <span>
                      {num(page * PAGE_SIZE + 1)}–{num(Math.min((page + 1) * PAGE_SIZE, rows.length))} of {num(rows.length)} rows
                      {report.truncated && ' (limit reached — narrow the filters)'}
                    </span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
                      Page {page + 1} of {pageCount}
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</button>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
      <style>{`@media (max-width: 860px) { .std-reports-grid { grid-template-columns: minmax(0, 1fr) !important; } .std-reports-grid > aside { position: static !important; } }`}</style>
    </div>
  );
}
