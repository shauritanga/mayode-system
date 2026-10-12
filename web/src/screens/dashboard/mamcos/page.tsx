'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Building06Icon,
  Cancel01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { authApi, mamcosApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/store/auth.store';
import { MetricTile, MetricTileSkeleton, TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { apiErrorMessage } from '@/lib/api-error';
import CooperativeAdminModal from './CooperativeAdminModal';

const PAGE_SIZE = 10;

interface Mamcos {
  id: string;
  name: string;
  district?: string;
  location?: string;
  chairmanName?: string;
  chairmanPhone?: string;
  totalHectares?: number;
  isActive: boolean;
  _count?: { farmers: number; farms: number };
}

const EMPTY_FORM = {
  name: '', location: '', district: '', totalHectares: '',
  leaderFirstName: '', leaderLastName: '', leaderPhone: '', leaderPassword: '',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function formatHectares(ha?: number): string {
  if (ha === undefined || ha === null || Number.isNaN(ha)) return '—';
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

export default function MamcosPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isSecretary = role === 'MAMCOS_SECRETARY';
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const [adminFor, setAdminFor] = useState<{ id: string; name: string } | null>(null);
  const [mamcos, setMamcos] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showMamcosForm, setShowMamcosForm] = useState(false);
  const [form, setForm] = useState<any>({ ...EMPTY_FORM });

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [status]);

  // A Secretary only ever sees their own AMCOS, resolved server-side from
  // their own profile — never the full cooperative list.
  const load = () => {
    setLoading(true);
    if (isSecretary) {
      mamcosApi.dashboard()
        .then(res => {
          const m = res.data?.mamcos;
          const scoped: Mamcos[] = m ? [{ ...m, _count: { farmers: m.farmers?.length ?? 0, farms: m.farms?.length ?? 0 } }] : [];
          setMamcos(scoped);
        })
        .catch(console.error).finally(() => setLoading(false));
    } else {
      mamcosApi.getAll()
        .then(res => setMamcos(res.data || []))
        .catch(console.error).finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSecretary]);

  // Creates the AMCOS, then registers its cooperative administrator in the same flow. The account is created second so a failure
  // (e.g. duplicate phone) doesn't lose the AMCOS that was just created; it's reported without
  // rolling anything back, and an administrator can still be added from the AMCOS list.
  const createMamcos = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage(''); setFormError('');
    setCreating(true);
    try {
      const res = await mamcosApi.create({
        name: form.name, location: form.location, district: form.district,
        totalHectares: form.totalHectares ? Number(form.totalHectares) : undefined,
      });
      const newId = res.data?.id;

      {
        try {
          await authApi.createCooperativeAdmin({
            firstName: form.leaderFirstName, lastName: form.leaderLastName,
            phone: form.leaderPhone, password: form.leaderPassword,
            mamcosId: newId,
          });
          setMessage('AMCOS created and its administrator added.');
        } catch (adminErr) {
          setMessage(`AMCOS created, but the administrator account could not be created: ${apiErrorMessage(adminErr, 'unknown error')}. Use "Add admin" on the AMCOS list to try again.`);
        }
      }

      setForm({ ...EMPTY_FORM });
      setShowMamcosForm(false);
      load();
    } catch (e) {
      setFormError(apiErrorMessage(e, 'Could not create AMCOS.'));
    } finally { setCreating(false); }
  };

  const reduce = useReducedMotion();

  const filtered = useMemo(() => {
    return mamcos.filter((m) => {
      if (status === 'active' && !m.isActive) return false;
      if (status === 'inactive' && m.isActive) return false;
      if (debouncedSearch) {
        const haystack = `${m.name} ${m.location ?? ''} ${m.district ?? ''} ${m.chairmanName ?? ''}`.toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [mamcos, status, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pages = useMemo(() => pageNumbers(currentPage, totalPages), [currentPage, totalPages]);
  const rangeStart = filtered.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (debouncedSearch) chips.push({ key: 'search', label: `“${debouncedSearch}”`, clear: () => { setSearch(''); setDebouncedSearch(''); setPage(1); } });
    if (status) {
      const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
      chips.push({ key: 'status', label, clear: () => { setStatus(''); setPage(1); } });
    }
    return chips;
  }, [debouncedSearch, status]);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatus('');
    setPage(1);
  };

  const totalFarmers = mamcos.reduce((sum, m) => sum + (m._count?.farmers ?? 0), 0);
  const totalHectares = mamcos.reduce((sum, m) => sum + (m.totalHectares ?? 0), 0);
  const activeCount = mamcos.filter((m) => m.isActive).length;

  return (
    <div className="page-shell farmers-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>AMCOS Cooperatives</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>{isSecretary ? 'Your cooperative scheme' : 'Registered cooperative management schemes'}</p>
        </div>
        {!isSecretary && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={() => { setFormError(''); setShowMamcosForm(true); }}>+ New AMCOS</button>
          </div>
        )}
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--accent)' }}>{message}</div>}

      {adminFor && (
        <CooperativeAdminModal
          mamcos={adminFor}
          onClose={() => setAdminFor(null)}
          onCreated={(text) => setMessage(text)}
        />
      )}

      {showMamcosForm && (
        <Modal
          title="Create AMCOS"
          subtitle="Register the cooperative and its administrator, who will manage its roles and team."
          onClose={() => setShowMamcosForm(false)}
          width="560px"
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setShowMamcosForm(false)} disabled={creating}>Cancel</button>
              <button type="submit" form="amcos-form" className="btn-primary" disabled={creating}>{creating ? 'Saving…' : 'Create AMCOS'}</button>
            </>
          }
        >
          <form id="amcos-form" className="ua-form" onSubmit={createMamcos} autoComplete="off">
            <div className="ua-section">
              <div className="ua-section-title">Cooperative details</div>
              <div className="ua-field">
                <label className="ua-label" htmlFor="am-name">AMCOS name</label>
                <input id="am-name" name="amcos-name" className="input-field" required autoComplete="off" placeholder="e.g. Mbarali Rice Growers" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="ua-row">
                <div className="ua-field">
                  <label className="ua-label" htmlFor="am-location">Location<span className="ua-opt">optional</span></label>
                  <input id="am-location" name="amcos-location" className="input-field" autoComplete="off" placeholder="Village or ward" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div className="ua-field">
                  <label className="ua-label" htmlFor="am-district">District<span className="ua-opt">optional</span></label>
                  <input id="am-district" name="amcos-district" className="input-field" autoComplete="off" placeholder="e.g. Mbarali" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} />
                </div>
              </div>
              <div className="ua-field">
                <label className="ua-label" htmlFor="am-ha">Total hectares<span className="ua-opt">optional</span></label>
                <input id="am-ha" name="amcos-hectares" className="input-field" type="number" min={0} step="any" autoComplete="off" placeholder="Area under the cooperative, in hectares" value={form.totalHectares} onChange={e => setForm({ ...form, totalHectares: e.target.value })} />
              </div>
            </div>

            <div className="ua-section">
              <div className="ua-section-title">Cooperative administrator</div>
              <div className="ua-role-note">
                The administrator signs in to the Cooperative Portal with this phone number and password, then creates their own roles and team.
              </div>
              <div className="ua-row">
                <div className="ua-field">
                  <label className="ua-label" htmlFor="am-first">First name</label>
                  <input id="am-first" required name="admin-first-name" className="input-field" autoComplete="off" value={form.leaderFirstName} onChange={e => setForm({ ...form, leaderFirstName: e.target.value })} />
                </div>
                <div className="ua-field">
                  <label className="ua-label" htmlFor="am-last">Last name</label>
                  <input id="am-last" required name="admin-last-name" className="input-field" autoComplete="off" value={form.leaderLastName} onChange={e => setForm({ ...form, leaderLastName: e.target.value })} />
                </div>
              </div>
              <div className="ua-field">
                <label className="ua-label" htmlFor="am-phone">Phone number</label>
                <input id="am-phone" required name="admin-phone" className="input-field" type="tel" autoComplete="off" placeholder="+255 7XX XXX XXX" value={form.leaderPhone} onChange={e => setForm({ ...form, leaderPhone: e.target.value })} />
                <span className="ua-hint">Their sign-in name.</span>
              </div>
              <div className="ua-field">
                <label className="ua-label" htmlFor="am-pass">Temporary password</label>
                <div className="ua-input-wrap">
                  <input id="am-pass" required name="admin-temp-password" className="input-field" minLength={6} autoComplete="new-password" type={showAdminPassword ? 'text' : 'password'} value={form.leaderPassword} onChange={e => setForm({ ...form, leaderPassword: e.target.value })} />
                  <button type="button" className="ua-reveal" onClick={() => setShowAdminPassword(v => !v)} aria-label={showAdminPassword ? 'Hide password' : 'Show password'}>
                    <HugeiconsIcon icon={showAdminPassword ? ViewOffIcon : ViewIcon} size={18} strokeWidth={1.8} />
                  </button>
                </div>
                <span className="ua-hint">At least 6 characters. Share it securely.</span>
              </div>
            </div>
            {formError && <div className="ua-form-error" role="alert">{formError}</div>}
          </form>
        </Modal>
      )}

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
            <MetricTile label="Total AMCOS" value={mamcos.length} hint="Registered cooperative schemes" tone="green" />
            <MetricTile label="Active" value={activeCount} hint="Currently operating" tone="blue" />
            <MetricTile label="Farmers covered" value={totalFarmers} hint="Across all schemes" tone="gold" />
            <MetricTile label="Total hectares" value={formatHectares(totalHectares)} hint="Combined scheme area" tone="red" />
          </>
        )}
      </div>

      {/* Unified list workspace */}
      <section className="glass-card farmers-workspace farmers-workspace-tint">
        {!isSecretary && (
          <div className="farmers-toolbar">
            <div className="farmers-toolbar-main">
              <div className="farmers-search">
                <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2} />
                <input
                  id="mamcos-search"
                  type="search"
                  placeholder="Search name, location or chairman…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="farmers-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
              >
                {STATUS_OPTIONS.map((o) => (
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
        )}

        {loading ? (
          <TableSkeleton rows={PAGE_SIZE} />
        ) : filtered.length === 0 ? (
          <div className="builder-empty farmers-empty">
            <span className="icon-chip" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <HugeiconsIcon icon={Building06Icon} size={24} strokeWidth={1.8} />
            </span>
            <div className="farmers-empty-title">No cooperatives found</div>
            <div className="farmers-empty-copy">
              {activeChips.length > 0
                ? 'Nothing matches the current filters. Clear one or more filters to widen the list.'
                : 'No AMCOS cooperatives have been registered yet.'}
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
                  <th>Name</th>
                  <th>District</th>
                  <th>Chairman</th>
                  <th className="num">Farmers</th>
                  <th className="num">Farms</th>
                  <th className="num">Hectares</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((m, i) => (
                  <motion.tr
                    key={m.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
                  >
                    <td>
                      <div className="farmers-person">
                        <span className="avatar-circle farmers-avatar">
                          {m.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="farmers-person-text">
                          <div className="farmers-name">{m.name}</div>
                          <div className="farmers-phone">{m.location || 'Location not set'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="farmers-cell">{m.district || '—'}</td>
                    <td className="farmers-cell">{m.chairmanName || '—'}</td>
                    <td className="num">
                      <span className="farmers-size">{m._count?.farmers ?? '—'}</span>
                    </td>
                    <td className="num">
                      <span className="farmers-size">{m._count?.farms ?? '—'}</span>
                    </td>
                    <td className="num">
                      <span className="farmers-size">{formatHectares(m.totalHectares)}</span>
                    </td>
                    <td>
                      <span className={`badge ${m.isActive ? 'badge-green' : 'badge-gray'}`}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/dashboard/mamcos/${m.id}`} className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', display: 'inline-block', textDecoration: 'none' }}>View</Link>
                      {isSuperAdmin && (
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', marginLeft: 6 }} onClick={() => setAdminFor({ id: m.id, name: m.name })}>Add admin</button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
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
