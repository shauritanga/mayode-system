'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Cancel01Icon, MapsIcon, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { farmsApi } from '@/lib/api';
import { hasPermission } from '@/lib/nav';
import { Tabs } from '@/components/ops/ui';
import OpsFarmPage from '../ops-farm/page';
import { useAuthStore } from '@/store/auth.store';
import FarmEditorModal from '@/components/FarmEditorModal';
import { OWNERSHIP_LABELS, fmtHa, locationLabel, productionLabel, riceVarieties, tenureLabel, toCsv, totalPlotHectares } from '@/lib/farm-format';
import { isFarmBoundaryMapped } from '@/lib/farm-geo';
import { MetricTile, MetricTileSkeleton, TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

const FarmsMap = dynamic(() => import('@/components/FarmsMap'), { ssr: false, loading: () => <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading map…</div> });

const PAGE_SIZE = 10;

function pageNumbers(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const window = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...window].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

interface Farm {
  id: string;
  farmCode: string;
  name?: string;
  region?: string | null;
  district?: string | null;
  ward?: string | null;
  village?: string | null;
  subVillage?: string | null;
  ownershipType?: string | null;
  landTenure?: string | null;
  waterSource?: string | null;
  plots?: { sizeAcres?: number | null }[];
  cropCycles?: { riceVariety?: string | null; status?: string | null }[];
  _count?: { plots: number; cropCycles: number };
  socialHectares: number;
  grade: string;
  isVerified: boolean;
  isLeased: boolean;
  hasIrrigation: boolean;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  boundaryCoordinates?: unknown;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  mamcos?: { name: string };
}

type FarmFilter = 'all' | 'pending-boundary' | 'verified' | 'unmapped';

const FILTER_OPTIONS: { value: FarmFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending-boundary', label: 'Boundary queue' },
  { value: 'unmapped', label: 'Unmapped' },
];

function filterFromUrl(): FarmFilter {
  if (typeof window === 'undefined') return 'all';
  const value = new URLSearchParams(window.location.search).get('filter');
  if (value === 'pending-boundary' || value === 'verified' || value === 'unmapped') return value;
  return 'all';
}

interface AttrFilters {
  region: string; district: string; ward: string; village: string; subVillage: string;
  ownershipType: string; production: string; waterSource: string; variety: string;
}
const NO_ATTR_FILTERS: AttrFilters = { region: '', district: '', ward: '', village: '', subVillage: '', ownershipType: '', production: '', waterSource: '', variety: '' };

const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

function FarmsList() {
  const reduce = useReducedMotion();
  const role = useAuthStore((state) => state.user?.role);
  const canRegister = role === 'SUPER_ADMIN' || role === 'FIELD_OFFICER';
  const [attrs, setAttrs] = useState<AttrFilters>(NO_ATTR_FILTERS);
  const [registering, setRegistering] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filter, setFilter] = useState<FarmFilter>('all');
  const [page, setPage] = useState(1);

  const load = () => {
    farmsApi.getAll()
      .then((res) => setFarms(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setFilter(filterFromUrl());
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter, attrs]);

  const filtered = useMemo(() => {
    return farms.filter((f) => {
      const matchesSearch = `${f.farmCode} ${f.name || ''} ${f.farmer?.firstName || ''} ${f.farmer?.lastName || ''} ${f.farmer?.controlNumber || ''} ${locationLabel(f)}`
        .toLowerCase()
        .includes(debouncedSearch);
      if (!matchesSearch) return false;
      if (attrs.region && f.region !== attrs.region) return false;
      if (attrs.district && f.district !== attrs.district) return false;
      if (attrs.ward && f.ward !== attrs.ward) return false;
      if (attrs.village && f.village !== attrs.village) return false;
      if (attrs.subVillage && f.subVillage !== attrs.subVillage) return false;
      if (attrs.ownershipType && f.ownershipType !== attrs.ownershipType) return false;
      if (attrs.production && productionLabel(f) !== attrs.production) return false;
      if (attrs.waterSource && f.waterSource !== attrs.waterSource) return false;
      if (attrs.variety && !riceVarieties(f).includes(attrs.variety)) return false;
      if (filter === 'pending-boundary') return !f.isVerified && isFarmBoundaryMapped(f);
      if (filter === 'verified') return f.isVerified;
      if (filter === 'unmapped') return !isFarmBoundaryMapped(f);
      return true;
    });
  }, [farms, debouncedSearch, filter, attrs]);

  // Each location level only offers values that exist under the level above it.
  const within = (level: keyof AttrFilters, rows: Farm[]) => rows.filter((f) => !attrs[level] || (f as any)[level] === attrs[level]);
  const regionOptions = distinct(farms.map((f) => f.region));
  const districtOptions = distinct(within('region', farms).map((f) => f.district));
  const wardOptions = distinct(within('district', within('region', farms)).map((f) => f.ward));
  const villageOptions = distinct(within('ward', within('district', within('region', farms))).map((f) => f.village));
  const subVillageOptions = distinct(within('village', within('ward', within('district', within('region', farms)))).map((f) => f.subVillage));
  const waterOptions = distinct(farms.map((f) => f.waterSource));
  const varietyOptions = distinct(farms.flatMap((f) => riceVarieties(f)));
  const setAttr = (key: keyof AttrFilters, value: string) => {
    const order: (keyof AttrFilters)[] = ['region', 'district', 'ward', 'village', 'subVillage'];
    const idx = order.indexOf(key);
    setAttrs((prev) => {
      const next = { ...prev, [key]: value };
      if (idx >= 0) order.slice(idx + 1).forEach((k) => { next[k] = ''; });
      return next;
    });
  };

  const exportCsv = () => {
    const csv = toCsv(
      ['Farm ID', 'Farmer', 'Control number', 'Region', 'District', 'Ward', 'Village', 'Sub-village', 'Latitude', 'Longitude', 'Hectares', 'Plots', 'Plot area (ha)', 'Ownership', 'Tenure', 'Production', 'Water source', 'Rice variety', 'Boundary mapped', 'Verified'],
      filtered.map((f) => [
        f.farmCode, f.farmer ? `${f.farmer.firstName} ${f.farmer.lastName}` : '', f.farmer?.controlNumber ?? '',
        f.region ?? '', f.district ?? '', f.ward ?? '', f.village ?? '', f.subVillage ?? '',
        f.centerLatitude ?? '', f.centerLongitude ?? '', f.socialHectares, f._count?.plots ?? 0, totalPlotHectares(f).toFixed(2),
        f.ownershipType ? OWNERSHIP_LABELS[f.ownershipType] || f.ownershipType : '', f.landTenure ?? '', productionLabel(f), f.waterSource ?? '',
        riceVarieties(f).join('; '), isFarmBoundaryMapped(f) ? 'Yes' : 'No', f.isVerified ? 'Yes' : 'No',
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'farms.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pages = useMemo(() => pageNumbers(currentPage, totalPages), [currentPage, totalPages]);
  const rangeStart = filtered.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const pendingBoundary = farms.filter((f) => !f.isVerified && isFarmBoundaryMapped(f)).length;
  const mappedCount = farms.filter((f) => isFarmBoundaryMapped(f)).length;
  const totalHectares = farms.reduce((a, f) => a + f.socialHectares, 0);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (debouncedSearch) chips.push({ key: 'search', label: `“${debouncedSearch}”`, clear: () => { setSearch(''); setPage(1); } });
    if (filter !== 'all') {
      const label = FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? filter;
      chips.push({ key: 'filter', label, clear: () => { setFilter('all'); setPage(1); } });
    }
    (Object.keys(attrs) as (keyof AttrFilters)[]).forEach((key) => {
      if (attrs[key]) chips.push({ key, label: attrs[key], clear: () => setAttr(key, '') });
    });
    return chips;
  }, [debouncedSearch, filter, attrs]);

  const resetFilters = () => { setSearch(''); setFilter('all'); setAttrs(NO_ATTR_FILTERS); setPage(1); };

  return (
    <div className="page-shell farmers-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farms</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>
            All registered farm parcels & GPS boundaries
            {filter === 'pending-boundary' ? ' — mapped farms awaiting official boundary approval' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={exportCsv} disabled={loading || filtered.length === 0}>Export CSV</button>
          {canRegister && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setRegistering(true)}>+ Register farm</button>}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-tint)', borderRadius: 8, padding: 4 }}>
          <button className={view === 'list' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setView('list')}>List</button>
          <button className={view === 'map' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setView('map')}>Map</button>
        </div>
        </div>
      </div>

      {/* Summary */}
      <div className="role-grid farmers-summary">
        {loading ? (
          <>
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
          </>
        ) : (
          <>
            <MetricTile label="Total farms" value={farms.length} hint="Registered parcels" tone="green" />
            <MetricTile label="Verified" value={farms.filter((f) => f.isVerified).length} hint="Approved farms" tone="blue" />
            <MetricTile label="Boundary mapped" value={mappedCount} hint="Walked GPS boundary on file" tone="red" />
            <MetricTile label="Currently leased" value={farms.filter((f) => f.isLeased).length} hint="Farms under lease" tone="purple" />
            <MetricTile label="Total hectares" value={`${totalHectares.toFixed(1)} ha`} hint="Combined farm size" tone="blue" />
            <MetricTile label="Plots" value={farms.reduce((a, f) => a + (f._count?.plots ?? 0), 0)} hint={`${fmtHa(farms.reduce((a, f) => a + totalPlotHectares(f), 0))} recorded plot area`} tone="green" />
            <MetricTile label="Irrigated" value={farms.filter((f) => f.hasIrrigation).length} hint={`${farms.filter((f) => !f.hasIrrigation).length} rain-fed`} tone="blue" />
          </>
        )}
      </div>

      {/* Unified list workspace */}
      <section className="glass-card farmers-workspace farmers-workspace-tint">
        <div className="farmers-toolbar">
          <div className="farmers-toolbar-main">
            <div className="farmers-search">
              <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2} />
              <input
                id="farms-search"
                type="search"
                placeholder="Search farm code or farmer name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="farmers-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FarmFilter)}
              aria-label="Farm status"
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="farmers-toolbar-main" style={{ flexWrap: 'wrap' }}>
            {([
              ['region', 'All regions', regionOptions],
              ['district', 'All districts', districtOptions],
              ['ward', 'All wards', wardOptions],
              ['village', 'All villages', villageOptions],
              ['subVillage', 'All sub-villages', subVillageOptions],
              ['variety', 'All rice varieties', varietyOptions],
              ['waterSource', 'All water sources', waterOptions],
            ] as [keyof AttrFilters, string, string[]][]).map(([key, label, options]) => (
              <select key={key} className="farmers-select" value={attrs[key]} onChange={(e) => setAttr(key, e.target.value)} aria-label={label}>
                <option value="">{label}</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            <select className="farmers-select" value={attrs.ownershipType} onChange={(e) => setAttr('ownershipType', e.target.value)} aria-label="Tenure">
              <option value="">All tenure types</option>
              {Object.entries(OWNERSHIP_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <select className="farmers-select" value={attrs.production} onChange={(e) => setAttr('production', e.target.value)} aria-label="Production system">
              <option value="">Irrigated &amp; rain-fed</option>
              <option value="Irrigated">Irrigated</option>
              <option value="Rain-fed">Rain-fed</option>
            </select>
          </div>

          {activeChips.length > 0 && (
            <div className="farmers-chips">
              {activeChips.map((chip) => (
                <button key={chip.key} type="button" className="farmers-chip" onClick={chip.clear}>
                  {chip.label}
                  <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2.2} />
                </button>
              ))}
              <button type="button" className="farmers-chip-clear" onClick={resetFilters}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {view === 'map' ? (
          loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading farms…</div>
          ) : (
            <div style={{ padding: 12 }}>
              <FarmsMap farms={filtered} />
            </div>
          )
        ) : loading ? (
          <TableSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <div className="builder-empty farmers-empty">
            <span className="icon-chip" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <HugeiconsIcon icon={MapsIcon} size={24} strokeWidth={1.8} />
            </span>
            <div className="farmers-empty-title">No farms found</div>
            <div className="farmers-empty-copy">
              {activeChips.length > 0
                ? 'Nothing matches the current filters. Clear one or more filters to widen the list.'
                : 'No farms have been registered yet.'}
            </div>
            {activeChips.length > 0 && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px', marginTop: 4 }} onClick={resetFilters}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr>
                  <th>Farm ID</th>
                  <th>Farmer</th>
                  <th>Location</th>
                  <th>GPS</th>
                  <th className="num">Size</th>
                  <th className="num">Plots</th>
                  <th>Tenure</th>
                  <th>Production</th>
                  <th>Water source</th>
                  <th>Rice variety</th>
                  <th>Status</th>
                  {filter === 'pending-boundary' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {paged.map((farm, i) => (
                  <motion.tr
                    key={farm.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
                  >
                    <td className="farmers-cell">
                      <Link href={`/dashboard/farms/${farm.id}`} style={{ fontWeight: 700, textDecoration: 'none', color: 'var(--accent)' }}>{farm.farmCode}</Link>
                    </td>
                    <td>
                      <div className="farmers-person">
                        <span className="avatar-circle farmers-avatar">
                          {farm.farmer ? `${farm.farmer.firstName[0] ?? ''}${farm.farmer.lastName[0] ?? ''}`.toUpperCase() : '?'}
                        </span>
                        <div className="farmers-person-text">
                          <div className="farmers-name">{farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : '—'}</div>
                          <div className="farmers-phone">{farm.mamcos?.name || farm.farmer?.controlNumber || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="farmers-cell">{locationLabel(farm)}</td>
                    <td className="farmers-cell">
                      {farm.centerLatitude != null && farm.centerLongitude != null ? `${farm.centerLatitude.toFixed(4)}, ${farm.centerLongitude.toFixed(4)}` : '—'}
                      {isFarmBoundaryMapped(farm) && <div><span className="badge badge-green">Boundary</span></div>}
                    </td>
                    <td className="num"><span className="farmers-size">{fmtHa(farm.socialHectares)}</span></td>
                    <td className="num">
                      {farm._count?.plots ?? 0}
                      {totalPlotHectares(farm) > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtHa(totalPlotHectares(farm))}</div>}
                    </td>
                    <td className="farmers-cell">{tenureLabel(farm)}</td>
                    <td><span className={`badge ${farm.hasIrrigation ? 'badge-blue' : 'badge-gold'}`}>{productionLabel(farm)}</span></td>
                    <td className="farmers-cell">{farm.waterSource || '—'}</td>
                    <td className="farmers-cell">{riceVarieties(farm).join(', ') || '—'}</td>
                    <td>
                      <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>{farm.isVerified ? '✓ Verified' : '⏳ Pending'}</span>
                      {farm.isLeased && <div><span className="badge badge-blue">Leased</span></div>}
                    </td>
                    {filter === 'pending-boundary' && (
                      <td>
                        <Link href={`/dashboard/farms/${farm.id}`} className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', textDecoration: 'none' }}>
                          Review boundary
                        </Link>
                      </td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && view === 'list' && filtered.length > 0 && (
          <div className="farmers-footer">
            <span className="farmers-range">
              Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{filtered.length.toLocaleString()}</strong>
            </span>
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
                </button>
                {pages.map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="page-gap">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`page-btn ${p === currentPage ? 'active' : ''}`}
                      onClick={() => setPage(p)}
                      aria-current={p === currentPage ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  className="page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {registering && (
        <FarmEditorModal
          onClose={() => setRegistering(false)}
          onSaved={() => { setRegistering(false); setLoading(true); load(); }}
        />
      )}
    </div>
  );
}

/** One Farms page: member farms, and Mayode's own farms as a second tab. */
export default function FarmsPage() {
  const user = useAuthStore((state) => state.user);
  const canFarms = hasPermission(user, 'farms', 'VIEW');
  const canMayode = ['ops_farm_tasks', 'ops_reports', 'ops_farm_inputs', 'ops_harvest'].some((r) => hasPermission(user, r, 'VIEW'));
  const tabs = [
    ...(canFarms ? [{ id: 'farms' as const, label: 'Farms' }] : []),
    ...(canMayode ? [{ id: 'mayode' as const, label: 'Mayode Farms' }] : []),
  ];
  const [picked, setPicked] = useState<'farms' | 'mayode'>('farms');
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0]?.id;
  return (
    <div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab ?? 'farms'} onChange={setPicked} />}
      {tab === 'mayode' ? <OpsFarmPage /> : <FarmsList />}
    </div>
  );
}
