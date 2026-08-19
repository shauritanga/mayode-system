'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  FilterHorizontalIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  UserGroupIcon,
  Cancel01Icon,
  CheckmarkBadge02Icon,
  Clock01Icon,
  AlertCircleIcon,
} from '@hugeicons/core-free-icons';
import { farmersApi, mamcosApi } from '@/lib/api';
import { MetricTile, MetricTileSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

const PAGE_SIZE = 10;

interface Farmer {
  id: string;
  controlNumber: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  district?: string | null;
  region?: string | null;
  ward?: string | null;
  village?: string | null;
  isBlacklisted: boolean;
  verificationStatus: string;
  farmSizeHa?: number;
  mamcos?: { name: string } | null;
  user?: { phone: string; isActive: boolean } | null;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Mamcos {
  id: string;
  name: string;
}

interface Overview {
  total: number;
  byVerificationStatus: { status: string; count: number }[];
}

const VERIFICATION_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'NEEDS_MORE_INFO', label: 'Needs info' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  VERIFIED: { badge: 'badge-green', label: 'Verified' },
  PENDING: { badge: 'badge-gold', label: 'Pending' },
  NEEDS_MORE_INFO: { badge: 'badge-blue', label: 'Needs info' },
  DISPUTED: { badge: 'badge-red', label: 'Disputed' },
  REJECTED: { badge: 'badge-red', label: 'Rejected' },
  SUSPENDED: { badge: 'badge-gray', label: 'Suspended' },
};

function StatusBadge({ status, blacklisted }: { status: string; blacklisted: boolean }) {
  const s = STATUS_STYLES[status] ?? { badge: 'badge-gray', label: status };
  return (
    <span className="farmers-status">
      <span className={`badge ${s.badge}`}>{s.label}</span>
      {blacklisted && <span className="badge badge-red">Blacklisted</span>}
    </span>
  );
}

function formatGender(gender?: string | null): string {
  if (!gender) return '—';
  return gender.charAt(0) + gender.slice(1).toLowerCase();
}

function formatFarmSize(ha?: number): string {
  if (ha === undefined || ha === null || Number.isNaN(ha)) return '—';
  if (ha === 0) return '0 ha';
  return `${ha.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`;
}

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

export default function FarmersPage() {
  const reduce = useReducedMotion();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [mamcosList, setMamcosList] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [mamcosId, setMamcosId] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [ward, setWard] = useState('');
  const [village, setVillage] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 450);
    return () => clearTimeout(timer);
  }, [search]);

  const applyFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const moreActiveCount = [region, district, ward, village].filter(Boolean).length;
  const anyFilterActive = !!(debouncedSearch || status || mamcosId || moreActiveCount);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (debouncedSearch) chips.push({ key: 'search', label: `“${debouncedSearch}”`, clear: () => { setSearch(''); setDebouncedSearch(''); setPage(1); } });
    if (status) {
      const label = VERIFICATION_OPTIONS.find((o) => o.value === status)?.label ?? status;
      chips.push({ key: 'status', label, clear: () => { setStatus(''); setPage(1); } });
    }
    if (mamcosId) {
      const name = mamcosList.find((m) => m.id === mamcosId)?.name ?? 'AMCOS';
      chips.push({ key: 'mamcos', label: name, clear: () => { setMamcosId(''); setPage(1); } });
    }
    if (region) chips.push({ key: 'region', label: `Region: ${region}`, clear: () => { setRegion(''); setPage(1); } });
    if (district) chips.push({ key: 'district', label: `District: ${district}`, clear: () => { setDistrict(''); setPage(1); } });
    if (ward) chips.push({ key: 'ward', label: `Ward: ${ward}`, clear: () => { setWard(''); setPage(1); } });
    if (village) chips.push({ key: 'village', label: `Village: ${village}`, clear: () => { setVillage(''); setPage(1); } });
    return chips;
  }, [debouncedSearch, status, mamcosId, mamcosList, region, district, ward, village]);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatus('');
    setMamcosId('');
    setRegion('');
    setDistrict('');
    setWard('');
    setVillage('');
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setOverviewLoading(true);
      farmersApi
        .overview()
        .then((res) => { if (!cancelled) setOverview(res.data as Overview); })
        .catch(() => { if (!cancelled) setOverview(null); })
        .finally(() => { if (!cancelled) setOverviewLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      farmersApi
        .getAll({
          page,
          pageSize: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(status ? { verificationStatus: status } : {}),
          ...(mamcosId ? { mamcosId } : {}),
          ...(region ? { region } : {}),
          ...(district ? { district } : {}),
          ...(ward ? { ward } : {}),
          ...(village ? { village } : {}),
        })
        .then((res) => {
          if (cancelled) return;
          setFarmers(res.data?.data ?? []);
          setPagination(res.data?.pagination ?? null);
        })
        .catch(() => {
          if (!cancelled) {
            setFarmers([]);
            setPagination(null);
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [page, debouncedSearch, status, mamcosId, region, district, ward, village]);

  useEffect(() => {
    mamcosApi.getAll().then((res) => {
      const raw = res.data;
      setMamcosList(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }).catch(() => {});
  }, []);

  const pages = useMemo(
    () => pageNumbers(pagination?.page ?? 1, pagination?.totalPages ?? 1),
    [pagination],
  );
  const rangeStart = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const rangeEnd = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  const countOf = (s: string) =>
    overview?.byVerificationStatus.find((x) => x.status === s)?.count ?? 0;
  const verified = countOf('VERIFIED');
  const pending = countOf('PENDING') + countOf('NEEDS_MORE_INFO');
  const flagged = countOf('REJECTED') + countOf('SUSPENDED') + countOf('DISPUTED');

  return (
    <div className="page-shell farmers-page">
      {/* Summary */}
      <div className="role-grid farmers-summary">
        {overviewLoading ? (
          <>
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
          </>
        ) : (
          <>
            <MetricTile label="Total farmers" value={overview?.total ?? 0} hint="Registered in the cooperative" tone="green" />
            <MetricTile label="Verified" value={verified} hint="Ready for field operations" tone="blue" />
            <MetricTile label="Awaiting review" value={pending} hint="Pending or needs more info" tone="gold" />
            <MetricTile label="Flagged" value={flagged} hint="Rejected, suspended or disputed" tone="red" />
          </>
        )}
      </div>

      {/* Unified list workspace */}
      <section className="glass-card farmers-workspace">
        <div className="farmers-toolbar">
          <div className="farmers-toolbar-main">
            <div className="farmers-search">
              <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2} />
              <input
                id="farmers-search"
                type="search"
                placeholder="Search name, control no. or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="farmers-select"
              value={status}
              onChange={(e) => applyFilter(setStatus)(e.target.value)}
              aria-label="Verification status"
            >
              {VERIFICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <select
              className="farmers-select"
              value={mamcosId}
              onChange={(e) => applyFilter(setMamcosId)(e.target.value)}
              aria-label="AMCOS"
            >
              <option value="">All AMCOS</option>
              {mamcosList.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <button
              type="button"
              className={`farmers-filter-btn ${moreOpen || moreActiveCount ? 'active' : ''}`}
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
            >
              <HugeiconsIcon icon={FilterHorizontalIcon} size={14} strokeWidth={2} />
              Location
              {moreActiveCount > 0 && <span className="badge badge-green">{moreActiveCount}</span>}
            </button>
          </div>

          {moreOpen && (
            <div className="farmers-location-grid">
              <label className="form-label">Region
                <input className="input-field" value={region} onChange={(e) => applyFilter(setRegion)(e.target.value)} placeholder="e.g. Mbeya" />
              </label>
              <label className="form-label">District
                <input className="input-field" value={district} onChange={(e) => applyFilter(setDistrict)(e.target.value)} placeholder="e.g. Mbarali" />
              </label>
              <label className="form-label">Ward
                <input className="input-field" value={ward} onChange={(e) => applyFilter(setWard)(e.target.value)} placeholder="e.g. Rujewa" />
              </label>
              <label className="form-label">Village
                <input className="input-field" value={village} onChange={(e) => applyFilter(setVillage)(e.target.value)} placeholder="e.g. Madibira" />
              </label>
            </div>
          )}

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

        {loading ? (
          <div className="farmers-skeleton">
            {[...Array(PAGE_SIZE)].map((_, i) => (
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
        ) : farmers.length === 0 ? (
          <div className="builder-empty farmers-empty">
            <span className="icon-chip" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <HugeiconsIcon icon={UserGroupIcon} size={24} strokeWidth={1.8} />
            </span>
            <div className="farmers-empty-title">No farmers found</div>
            <div className="farmers-empty-copy">
              {anyFilterActive
                ? 'Nothing matches the current filters. Clear one or more filters to widen the list.'
                : 'No farmers have been registered yet.'}
            </div>
            {anyFilterActive && (
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
                  <th>Farmer ID</th>
                  <th>Full Name</th>
                  <th>Gender</th>
                  <th>District</th>
                  <th>Ward</th>
                  <th>Village</th>
                  <th>Group Name / AMCOS</th>
                  <th className="num">Farm Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {farmers.map((farmer, i) => (
                  <motion.tr
                    key={farmer.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
                  >
                    <td>
                      <span className="farmers-code">{farmer.controlNumber}</span>
                    </td>
                    <td>
                      <div className="farmers-person">
                        <span className="avatar-circle farmers-avatar">
                          {`${farmer.firstName[0] ?? ''}${farmer.lastName[0] ?? ''}`.toUpperCase() || '?'}
                        </span>
                        <div className="farmers-person-text">
                          <div className="farmers-name">{farmer.firstName} {farmer.lastName}</div>
                          <div className="farmers-phone">{farmer.user?.phone ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="farmers-cell">{formatGender(farmer.gender)}</td>
                    <td className="farmers-cell">{farmer.district || '—'}</td>
                    <td className="farmers-cell">{farmer.ward || '—'}</td>
                    <td className="farmers-cell">{farmer.village || '—'}</td>
                    <td>
                      <span className="farmers-amcos" title={farmer.mamcos?.name ?? undefined}>
                        {farmer.mamcos?.name ?? '—'}
                      </span>
                    </td>
                    <td className="num">
                      <span className="farmers-size">{formatFarmSize(farmer.farmSizeHa)}</span>
                    </td>
                    <td>
                      <StatusBadge status={farmer.verificationStatus} blacklisted={farmer.isBlacklisted} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pagination && pagination.total > 0 && (
          <div className="farmers-footer">
            <span className="farmers-range">
              Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{pagination.total.toLocaleString()}</strong>
            </span>
            <div className="pagination">
              <button
                className="page-btn"
                disabled={pagination.page <= 1}
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
                    className={`page-btn ${p === pagination.page ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                    aria-current={p === pagination.page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                className="page-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Legend for the summary tones — kept subtle, not a jumbotron */}
      <div className="farmers-legend" aria-hidden="true">
        <span><HugeiconsIcon icon={CheckmarkBadge02Icon} size={12} strokeWidth={2} /> Verified</span>
        <span><HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={2} /> Awaiting review</span>
        <span><HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={2} /> Flagged</span>
      </div>
    </div>
  );
}
