'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fieldOfficersApi } from '@/lib/api';
import { TableSkeleton, MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import AddOfficerModal from '@/components/AddOfficerModal';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { toCsv } from '@/lib/farm-format';
import { RANK_MEASURES, ago, officerName, syncTone, type OfficerRow } from '@/lib/field-officers';

const PAGE_SIZE = 15;
const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
const toneColor = { green: 'var(--green-500)', gold: 'var(--gold-400)', red: 'var(--red-500)' } as const;

interface Filters { search: string; region: string; district: string; status: string }
const NO_FILTERS: Filters = { search: '', region: '', district: '', status: '' };

export default function FieldOfficersPage() {
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [measure, setMeasure] = useState(RANK_MEASURES[0].key);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const account = useAuthStore((st) => st.user);
  // A cooperative administrator adds officers to their own cooperative; Super Admin (Mayode corporate) chooses the cooperative in the form.
  const canAdd = (!!account?.mamcosId || account?.role === 'SUPER_ADMIN') && hasPermission(account, 'users', 'CREATE');

  const load = () =>
    fieldOfficersApi.list()
      .then((r) => setOfficers(r.data || []))
      .catch((e) => setError(e?.response?.data?.message || 'Could not load field officers.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const set = (key: keyof Filters, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
  const rank = RANK_MEASURES.find((m) => m.key === measure)!;
  const fmt = (n: number) => (rank.format ? rank.format(n) : n.toLocaleString());

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return officers
      .filter((o) => {
        if (filters.region && o.region !== filters.region) return false;
        if (filters.district && o.district !== filters.district) return false;
        if (filters.status === 'active' && !o.isActive) return false;
        if (filters.status === 'inactive' && o.isActive) return false;
        if (filters.status === 'stale' && syncTone(o.lastSyncAt) === 'green') return false;
        if (!q) return true;
        return `${officerName(o)} ${o.employeeCode ?? ''} ${o.phone} ${o.assignedArea ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => rank.value(b) - rank.value(a));
  }, [officers, filters, rank]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters = Object.values(filters).some(Boolean);

  const sum = (pick: (o: OfficerRow) => number) => officers.reduce((s, o) => s + pick(o), 0);
  const rated = officers.filter((o) => o.dataCompleteness != null);
  const avgCompleteness = rated.length ? Math.round(rated.reduce((s, o) => s + (o.dataCompleteness ?? 0), 0) / rated.length) : null;
  const top = [...officers].sort((a, b) => rank.value(b) - rank.value(a));
  const best = Math.max(1, ...top.map((o) => Math.max(0, rank.value(o))));

  const exportCsv = () => {
    const csv = toCsv(
      ['Officer ID', 'Name', 'Phone', 'Region', 'District', 'Cooperative', 'Farmers assigned', 'Farms assigned', 'Farmers registered', 'Farms mapped', 'Visits completed', 'Crop records updated', 'Data completeness %', 'Pending tasks', 'Last sync', 'Status'],
      filtered.map((o) => [
        o.employeeCode ?? '', officerName(o), o.phone, o.region ?? '', o.district ?? '', o.cooperative ?? '', o.farmersAssigned, o.farmsAssigned,
        o.farmersRegistered, o.farmsMapped, o.visitsCompleted, o.cropRecordsUpdated, o.dataCompleteness ?? '', o.pendingTasks,
        o.lastSyncAt ? o.lastSyncAt.slice(0, 16).replace('T', ' ') : 'Never', o.isActive ? 'Active' : 'Inactive',
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'field-officers.csv';
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
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Field Officers</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginLeft: 14 }}>Extension officers and data collectors: assignments, registration, visits, pending work and app sync</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={exportCsv} disabled={loading || filtered.length === 0}>Export CSV</button>
          {canAdd && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setAdding(true)}>+ Add field officer</button>}
        </div>
      </div>
      {adding && <AddOfficerModal onClose={() => setAdding(false)} onCreated={load} />}

      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Field officers" value={officers.length} hint={`${officers.filter((o) => o.isActive).length} active`} tone="green" />
        <MetricTile label="Farmers assigned" value={sum((o) => o.farmersAssigned).toLocaleString()} hint={`${sum((o) => o.farmersRegistered).toLocaleString()} registered by officers`} tone="blue" />
        <MetricTile label="Farms assigned" value={sum((o) => o.farmsAssigned).toLocaleString()} hint={`${sum((o) => o.farmsMapped).toLocaleString()} mapped by officers`} tone="gold" />
        <MetricTile label="Visits completed" value={sum((o) => o.visitsCompleted).toLocaleString()} hint="All time" tone="purple" />
        <MetricTile label="Pending tasks" value={sum((o) => o.pendingTasks).toLocaleString()} hint="Verifications and follow-ups" tone="gold" />
        <MetricTile label="Avg data completeness" value={avgCompleteness == null ? '—' : `${avgCompleteness}%`} hint="Records officers registered" tone="green" />
      </div>

      <section className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Officer ranking</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Rank officers by">
            {RANK_MEASURES.map((m) => (
              <button key={m.key} role="tab" aria-selected={measure === m.key} type="button" className={measure === m.key ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setMeasure(m.key); setPage(1); }}>{m.label}</button>
            ))}
          </div>
        </div>
        {loading ? null : top.length === 0 ? (
          <div style={{ color: 'var(--neutral-500)', fontSize: 13 }}>No field officers yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {top.slice(0, 10).map((o, i) => {
              const v = rank.value(o);
              return (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(120px, 220px) 1fr 70px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: i < 3 ? 'var(--accent)' : 'var(--neutral-500)' }}>{i + 1}</span>
                  <Link href={`/dashboard/field-officers/${o.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{officerName(o)}</Link>
                  <div style={{ background: 'var(--neutral-100, rgba(128,128,128,0.15))', borderRadius: 6, height: 10 }}>
                    <div style={{ width: `${Math.max(0, (v / best) * 100)}%`, height: '100%', borderRadius: 6, background: 'var(--accent)' }} />
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card farmers-workspace">
        <div className="farmers-toolbar">
          <div className="farmers-toolbar-main" style={{ flexWrap: 'wrap' }}>
            <div className="farmers-search">
              <input type="search" placeholder="Search name, officer ID, phone or area…" value={filters.search} onChange={(e) => set('search', e.target.value)} />
            </div>
            {select('region', 'All regions', distinct(officers.map((o) => o.region)).map((x) => [x, x]))}
            {select('district', 'All districts', distinct(officers.map((o) => o.district)).map((x) => [x, x]))}
            {select('status', 'All officers', [['active', 'Active only'], ['inactive', 'Inactive only'], ['stale', 'Not synced in 24 h']])}
            {hasFilters && <button type="button" className="farmers-chip-clear" onClick={() => { setFilters(NO_FILTERS); setPage(1); }}>Clear all</button>}
          </div>
          <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Sorted by {rank.label.toLowerCase()}</span>
        </div>

        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--red-400)', fontSize: 14 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>{hasFilters ? 'No officers match these filters.' : (canAdd ? 'No field officers yet. Choose “+ Add field officer” to create one.' : 'No field officers yet. Their cooperative’s administrator creates them.')}</div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Officer</th>
                  <th>Phone</th>
                  <th>Region / district</th>
                  <th className="num">Farmers</th>
                  <th className="num">Farms</th>
                  <th className="num">Registered</th>
                  <th className="num">Visits</th>
                  <th className="num">Pending</th>
                  <th className="num">Data</th>
                  <th>Last app sync</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o, i) => {
                  const tone = syncTone(o.lastSyncAt);
                  return (
                    <tr key={o.id}>
                      <td style={{ color: 'var(--neutral-500)' }}>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                      <td>
                        <Link href={`/dashboard/field-officers/${o.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{officerName(o)}</Link>
                        <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{o.employeeCode ?? 'No ID'}{o.cooperative ? ` · ${o.cooperative}` : ''}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{o.phone}</td>
                      <td style={{ fontSize: 12 }}>{[o.region, o.district].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="num">{o.farmersAssigned.toLocaleString()}</td>
                      <td className="num">{o.farmsAssigned.toLocaleString()}</td>
                      <td className="num" title="Farmers registered / farms mapped">{o.farmersRegistered} / {o.farmsMapped}</td>
                      <td className="num">{o.visitsCompleted.toLocaleString()}</td>
                      <td className="num" title={`${o.pendingBreakdown.farmerVerifications} farmer verifications, ${o.pendingBreakdown.farmVerifications} farm verifications, ${o.pendingBreakdown.overdueVisits} overdue visits`}>{o.pendingTasks}</td>
                      <td className="num">{o.dataCompleteness == null ? '—' : `${o.dataCompleteness}%`}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: toneColor[tone], marginRight: 6 }} aria-hidden />
                        {ago(o.lastSyncAt) ?? 'Never'}
                      </td>
                      <td><span className={`badge ${o.isActive ? 'badge-green' : 'badge-gold'}`}>{o.isActive ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
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
    </div>
  );
}
