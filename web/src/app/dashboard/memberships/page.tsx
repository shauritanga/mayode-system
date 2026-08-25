'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  IdIcon,
} from '@hugeicons/core-free-icons';
import { membershipsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import Modal from '@/components/Modal';
import { MetricTile, MetricTileSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

const PAGE_SIZE = 10;

interface Plan {
  id: string;
  name: string;
  description?: string;
  priceTzs: number;
  durationType: string;
  features: string[];
  isActive: boolean;
}
interface Membership {
  id: string;
  user?: { phone: string };
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  plan?: { name: string; priceTzs: number };
  farmingSeason?: { name: string };
  status: string;
  paymentStatus: string;
  amountTzs?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'badge-green', SPONSORED: 'badge-green', WAIVED: 'badge-green',
  PENDING: 'badge-gold', PAYMENT_PENDING: 'badge-gold',
  EXPIRED: 'badge-gray', CANCELLED: 'badge-red', SUSPENDED: 'badge-red',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAYMENT_PENDING', label: 'Payment pending' },
  { value: 'SPONSORED', label: 'Sponsored' },
  { value: 'WAIVED', label: 'Waived' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_STYLES[status] || 'badge-gray'}`}>{status.replace(/_/g, ' ')}</span>;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

const emptyPlan = { name: '', description: '', priceTzs: '', durationType: 'SEASON', features: '' };

export default function MembershipsPage() {
  const reduce = useReducedMotion();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [tab, setTab] = useState<'members' | 'plans'>('members');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyPlan });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState('');

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

  useEffect(() => { setPage(1); }, [status, tab]);

  const load = () => {
    setLoading(true);
    Promise.all([
      membershipsApi.getAll().then((res) => setMemberships(res.data || [])),
      membershipsApi.listPlans().then((res) => setPlans(res.data || [])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submitPlan = async () => {
    setError('');
    if (!form.name.trim() || !form.priceTzs) {
      setError('Name and price are required.');
      return;
    }
    setSubmitting(true);
    try {
      await membershipsApi.createPlan({
        name: form.name,
        description: form.description || undefined,
        priceTzs: Number(form.priceTzs),
        durationType: form.durationType,
        features: form.features ? form.features.split(',').map((f) => f.trim()).filter(Boolean) : [],
      });
      setForm({ ...emptyPlan });
      setShowForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to create plan.');
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    setApproving(id);
    try {
      await membershipsApi.approve(id, {});
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(null);
    }
  };

  const reconcileOne = async (id: string) => {
    setApproving(id);
    setReconcileNotice('');
    try {
      const res = await membershipsApi.reconcileOne(id);
      setReconcileNotice(
        res.data?.active
          ? 'Payment confirmed — membership activated.'
          : `Still ${res.data?.paymentStatus || res.data?.status || 'pending'} with the payment provider.`,
      );
      load();
    } catch (e: any) {
      setReconcileNotice(e?.response?.data?.message || 'Could not reconcile this payment.');
    } finally {
      setApproving(null);
    }
  };

  const reconcileAllPending = async () => {
    setReconciling(true);
    setReconcileNotice('');
    try {
      const res = await membershipsApi.reconcilePending();
      const { checked = 0, activated = 0 } = res.data || {};
      setReconcileNotice(`Checked ${checked} pending payment(s); activated ${activated}.`);
      load();
    } catch (e: any) {
      setReconcileNotice(e?.response?.data?.message || 'Could not reconcile pending payments.');
    } finally {
      setReconciling(false);
    }
  };

  const active = memberships.filter((m) => m.status === 'ACTIVE').length;
  const pending = memberships.filter((m) => m.status === 'PENDING' || m.status === 'PAYMENT_PENDING').length;

  const filtered = useMemo(() => {
    return memberships.filter((m) => {
      if (status && m.status !== status) return false;
      if (debouncedSearch) {
        const haystack = `${m.farmer?.firstName ?? ''} ${m.farmer?.lastName ?? ''} ${m.farmer?.controlNumber ?? ''} ${m.user?.phone ?? ''} ${m.plan?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [memberships, status, debouncedSearch]);

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

  return (
    <div className="page-shell farmers-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Memberships</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Premium plans and farmer membership status — gates farm analytics</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && tab === 'members' && pending > 0 && (
            <button className="btn-secondary" onClick={reconcileAllPending} disabled={reconciling}>
              {reconciling ? 'Reconciling…' : 'Reconcile pending payments'}
            </button>
          )}
          {isAdmin && tab === 'plans' && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + New plan
            </button>
          )}
        </div>
      </div>

      {reconcileNotice && (
        <div className="glass-card" style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-1)' }}>
          {reconcileNotice}
        </div>
      )}

      {showForm && (
        <Modal
          title="New membership plan"
          onClose={() => { setShowForm(false); setError(''); }}
          width="600px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submitPlan} disabled={submitting}>
                {submitting ? 'Saving…' : 'Create plan'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <Field label="Plan name *" value={form.name} onChange={(v) => set('name', v)} placeholder="Season Premium" />
            <Field label="Price (TZS) *" value={form.priceTzs} onChange={(v) => set('priceTzs', v)} placeholder="15000" />
            <div>
              <label style={labelStyle}>Duration type</label>
              <select className="input-field" value={form.durationType} onChange={(e) => set('durationType', e.target.value)}>
                <option value="SEASON">Season</option>
                <option value="ANNUAL">Annual</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <Field label="Description" value={form.description} onChange={(v) => set('description', v)} placeholder="Full analytics for one season" />
            <Field label="Features (comma-separated)" value={form.features} onChange={(v) => set('features', v)} placeholder="Farm analytics, Yield forecasts" />
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {/* Summary */}
      <div className="role-grid farmers-summary">
        {loading ? (
          <>
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
          </>
        ) : (
          <>
            <MetricTile label="Active members" value={active} hint="Currently paid & valid" tone="green" />
            <MetricTile label="Awaiting payment" value={pending} hint="Pending or payment pending" tone="gold" />
            <MetricTile label="Plans" value={plans.length} hint="Membership plans on offer" tone="blue" />
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {(['members', 'plans'] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '8px 16px' }}
            onClick={() => setTab(t)}
          >
            {t === 'members' ? 'Memberships' : 'Plans'}
          </button>
        ))}
      </div>

      {/* Unified list workspace */}
      <section className="glass-card farmers-workspace farmers-workspace-tint">
        {tab === 'members' && (
          <div className="farmers-toolbar">
            <div className="farmers-toolbar-main">
              <div className="farmers-search">
                <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2} />
                <input
                  id="memberships-search"
                  type="search"
                  placeholder="Search farmer, control no., phone or plan…"
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
        ) : tab === 'members' ? (
          filtered.length === 0 ? (
            <div className="builder-empty farmers-empty">
              <span className="icon-chip" style={{ width: 52, height: 52, borderRadius: 16 }}>
                <HugeiconsIcon icon={IdIcon} size={24} strokeWidth={1.8} />
              </span>
              <div className="farmers-empty-title">No memberships found</div>
              <div className="farmers-empty-copy">
                {activeChips.length > 0
                  ? 'Nothing matches the current filters. Clear one or more filters to widen the list.'
                  : 'No memberships have been created yet.'}
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
                    <th>Plan</th>
                    <th>Season</th>
                    <th>Period</th>
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
                            {m.farmer ? `${m.farmer.firstName[0] ?? ''}${m.farmer.lastName[0] ?? ''}`.toUpperCase() : '?'}
                          </span>
                          <div className="farmers-person-text">
                            <div className="farmers-name">{m.farmer ? `${m.farmer.firstName} ${m.farmer.lastName}` : '—'}</div>
                            <div className="farmers-phone">{m.user?.phone ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="farmers-cell">{m.plan?.name || '—'}</td>
                      <td className="farmers-cell">{m.farmingSeason?.name || '—'}</td>
                      <td className="farmers-cell">{m.startDate ? `${fmtDate(m.startDate)} → ${fmtDate(m.endDate)}` : '—'}</td>
                      <td><StatusBadge status={m.status} /></td>
                      <td>
                        {(m.status === 'PENDING' || m.status === 'PAYMENT_PENDING') && isAdmin && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '11px', padding: '5px 10px' }}
                              disabled={approving === m.id}
                              onClick={() => reconcileOne(m.id)}
                            >
                              {approving === m.id ? '…' : 'Reconcile'}
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '11px', padding: '5px 10px' }}
                              disabled={approving === m.id}
                              onClick={() => approve(m.id)}
                            >
                              {approving === m.id ? '…' : 'Approve'}
                            </button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : plans.length === 0 ? (
          <div className="builder-empty farmers-empty">
            <span className="icon-chip" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <HugeiconsIcon icon={IdIcon} size={24} strokeWidth={1.8} />
            </span>
            <div className="farmers-empty-title">No plans found</div>
            <div className="farmers-empty-copy">No membership plans have been created yet.</div>
          </div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr><th>Plan</th><th>Price</th><th>Duration</th><th>Features</th><th>Active</th></tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{p.name}</td>
                    <td className="farmers-cell">{p.priceTzs.toLocaleString()} TZS</td>
                    <td className="farmers-cell">{p.durationType}</td>
                    <td className="farmers-cell">{(p.features || []).join(', ') || '—'}</td>
                    <td>{p.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'members' && filtered.length > 0 && (
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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input-field" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
