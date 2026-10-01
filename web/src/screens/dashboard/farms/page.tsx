'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Cancel01Icon, MapsIcon, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { farmsApi } from '@/lib/api';
import { isFarmBoundaryMapped } from '@/lib/farm-geo';
import { MetricTile, MetricTileSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

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
  village?: string;
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

const gradeBadge = (grade: string) => ({
  A: <span className="badge badge-green">Grade A</span>,
  B: <span className="badge badge-gold">Grade B</span>,
  C: <span className="badge badge-red">Grade C</span>,
}[grade] || <span className="badge badge-gray">{grade}</span>);

export default function FarmsPage() {
  const reduce = useReducedMotion();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filter, setFilter] = useState<FarmFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setFilter(filterFromUrl());
    farmsApi.getAll()
      .then((res) => setFarms(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter]);

  const filtered = useMemo(() => {
    return farms.filter((f) => {
      const matchesSearch = `${f.farmCode} ${f.name || ''} ${f.farmer?.firstName || ''} ${f.farmer?.lastName || ''}`
        .toLowerCase()
        .includes(debouncedSearch);
      if (!matchesSearch) return false;
      if (filter === 'pending-boundary') return !f.isVerified && isFarmBoundaryMapped(f);
      if (filter === 'verified') return f.isVerified;
      if (filter === 'unmapped') return !isFarmBoundaryMapped(f);
      return true;
    });
  }, [farms, debouncedSearch, filter]);

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
    return chips;
  }, [debouncedSearch, filter]);

  const resetFilters = () => { setSearch(''); setFilter('all'); setPage(1); };

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
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-tint)', borderRadius: 8, padding: 4 }}>
          <button className={view === 'list' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setView('list')}>List</button>
          <button className={view === 'map' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setView('map')}>Map</button>
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
            <MetricTile label="Total hectares" value={`${totalHectares.toFixed(1)} ha`} hint="Combined social hectares" tone="blue" />
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
          <div className="farmers-skeleton">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="farmers-skeleton-row">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 999 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text" style={{ width: '38%', marginBottom: 8 }} />
                  <div className="skeleton skeleton-text" style={{ width: '22%' }} />
                </div>
                <div className="skeleton skeleton-text" style={{ width: 72 }} />
                <div className="skeleton skeleton-text" style={{ width: 88 }} />
              </div>
            ))}
          </div>
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
                  <th>Farmer</th>
                  <th>AMCOS</th>
                  <th className="num">Hectares</th>
                  <th>Grade</th>
                  <th>Irrigation</th>
                  <th>Verified</th>
                  <th>Leased</th>
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
                    <td>
                      <Link href={`/dashboard/farms/${farm.id}`} className="farmers-person" style={{ textDecoration: 'none' }}>
                        <span className="avatar-circle farmers-avatar">
                          {farm.farmer ? `${farm.farmer.firstName[0] ?? ''}${farm.farmer.lastName[0] ?? ''}`.toUpperCase() : '?'}
                        </span>
                        <div className="farmers-person-text">
                          <div className="farmers-name">{farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : '—'}</div>
                          <div className="farmers-phone">{farm.farmer?.controlNumber ?? '—'}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="farmers-cell">{farm.mamcos?.name || '—'}</td>
                    <td className="num">
                      <span className="farmers-size">{farm.socialHectares} ha</span>
                    </td>
                    <td>{gradeBadge(farm.grade)}</td>
                    <td>
                      <span className={`badge ${farm.hasIrrigation ? 'badge-green' : 'badge-gray'}`}>
                        {farm.hasIrrigation ? '✓ Yes' : '✕ No'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>
                        {farm.isVerified ? '✓ Verified' : '⏳ Pending'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${farm.isLeased ? 'badge-blue' : 'badge-gray'}`}>
                        {farm.isLeased ? '🔒 Leased' : 'Available'}
                      </span>
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
    </div>
  );
}
