'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cropCyclesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TableSkeleton, MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import ActivityEditorModal from '@/components/ActivityEditorModal';
import { ACTIVITY_TYPES, activityInputs, activityLabel } from '@/lib/activity-types';
import { toCsv } from '@/lib/farm-format';

const PAGE_SIZE = 15;
const money = (n?: number | null) => (n || n === 0 ? `TZS ${Math.round(n).toLocaleString()}` : '—');
const officerName = (a: any) => (a.fieldOfficer ? `${a.fieldOfficer.firstName} ${a.fieldOfficer.lastName}` : '');
const farmerName = (a: any) => (a.cropCycle?.farmer ? `${a.cropCycle.farmer.firstName} ${a.cropCycle.farmer.lastName}` : '');

interface Filters { search: string; type: string; season: string; officer: string; from: string; to: string }
const NO_FILTERS: Filters = { search: '', type: '', season: '', officer: '', from: '', to: '' };
const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

export default function ActivitiesPage() {
  const role = useAuthStore((state) => state.user?.role);
  const canRecord = role === 'SUPER_ADMIN' || role === 'FIELD_OFFICER';
  const canEdit = role !== 'AUDITOR';
  const canDelete = role === 'SUPER_ADMIN' || role === 'MAMCOS_SECRETARY';

  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ activity?: any } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = () => {
    cropCyclesApi.activityLogs()
      .then((res) => { setActivities(res.data || []); setLoadError(''); })
      .catch((e) => setLoadError(e?.response?.data?.message || 'Could not load activity records.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (key: keyof Filters, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return activities.filter((a) => {
      if (filters.type && a.activityType !== filters.type) return false;
      if (filters.season && a.cropCycle?.season !== filters.season) return false;
      if (filters.officer && a.fieldOfficerId !== filters.officer) return false;
      const day = a.activityDate.slice(0, 10);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      if (!q) return true;
      const hay = `${farmerName(a)} ${a.cropCycle?.farmer?.controlNumber ?? ''} ${a.cropCycle?.farm?.farmCode ?? ''} ${a.plot?.plotCode ?? ''} ${activityInputs(a).text} ${a.description ?? ''} ${a.remarks ?? ''} ${officerName(a)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activities, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters = Object.values(filters).some(Boolean);

  const officers = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach((a) => a.fieldOfficerId && map.set(a.fieldOfficerId, officerName(a)));
    return [...map.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  }, [activities]);

  const monthStart = new Date(); monthStart.setDate(1);
  const thisMonth = activities.filter((a) => new Date(a.activityDate) >= monthStart).length;
  const totalCost = filtered.reduce((s, a) => s + (a.cost || 0), 0);
  const withPhotos = activities.filter((a) => a.photoUrls?.length).length;

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Activity', 'Farmer', 'Control number', 'Farm', 'Plot', 'Season', 'Input', 'Quantity', 'Cost (TZS)', 'Field officer', 'Photos', 'What was done', 'Remarks'],
      filtered.map((a) => {
        const inp = activityInputs(a);
        return [
          a.activityDate.slice(0, 10), activityLabel(a.activityType), farmerName(a), a.cropCycle?.farmer?.controlNumber ?? '',
          a.cropCycle?.farm?.farmCode ?? '', a.plot?.plotCode ?? '', a.cropCycle?.season ?? '', inp.text, inp.quantity,
          a.cost ?? '', officerName(a), a.photoUrls?.length ?? 0, a.description ?? '', a.remarks ?? '',
        ];
      }),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crop-activities.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this activity record? This cannot be undone.')) return;
    setMessage('');
    try {
      await cropCyclesApi.deleteActivityLog(id);
      setMessage('Activity deleted.');
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Delete failed.');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 4, height: 26, background: 'linear-gradient(to bottom, var(--green-600), var(--accent))', borderRadius: 9999 }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Crop Activities</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginLeft: 14 }}>Farm records: every activity in the rice production cycle, with inputs, cost, officer and photos</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={exportCsv} disabled={loading || filtered.length === 0}>Export CSV</button>
          {canRecord && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setEditor({})}>+ Record activity</button>}
        </div>
      </div>

      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Activities recorded" value={activities.length} hint={`${thisMonth} this month`} tone="green" />
        <MetricTile label="Cost of listed activities" value={money(totalCost)} hint={hasFilters ? 'Matching your filters' : 'All records'} tone="gold" />
        <MetricTile label="With photos" value={withPhotos} hint={`${activities.length ? Math.round((withPhotos / activities.length) * 100) : 0}% of records`} tone="blue" />
        <MetricTile label="Field officers" value={officers.length} hint="Recording activities" tone="purple" />
      </div>

      {message && <div className="alert-box alert-success" style={{ marginBottom: 16 }}>{message}</div>}

      <section className="glass-card farmers-workspace">
        <div className="farmers-toolbar">
          <div className="farmers-toolbar-main" style={{ flexWrap: 'wrap' }}>
            <div className="farmers-search">
              <input type="search" placeholder="Search farmer, farm, plot, input, officer or remarks…" value={filters.search} onChange={(e) => set('search', e.target.value)} />
            </div>
            <select className="farmers-select" value={filters.type} onChange={(e) => set('type', e.target.value)} aria-label="Activity type">
              <option value="">All activity types</option>
              {ACTIVITY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select className="farmers-select" value={filters.season} onChange={(e) => set('season', e.target.value)} aria-label="Season">
              <option value="">All seasons</option>
              {distinct(activities.map((a) => a.cropCycle?.season)).map((x) => <option key={x}>{x}</option>)}
            </select>
            <select className="farmers-select" value={filters.officer} onChange={(e) => set('officer', e.target.value)} aria-label="Field officer">
              <option value="">All field officers</option>
              {officers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <input className="farmers-select" type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} aria-label="From date" title="From date" />
            <input className="farmers-select" type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} aria-label="To date" title="To date" />
            {hasFilters && <button type="button" className="farmers-chip-clear" onClick={() => { setFilters(NO_FILTERS); setPage(1); }}>Clear all</button>}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : loadError ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--red-400)', fontSize: 14 }}>{loadError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>{hasFilters ? 'No activities match these filters.' : 'No activity records yet.'}</div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Farmer</th>
                  <th>Farm / plot</th>
                  <th>Inputs used</th>
                  <th className="num">Quantity</th>
                  <th className="num">Cost</th>
                  <th>Field officer</th>
                  <th>Photos</th>
                  <th>Remarks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paged.map((a) => {
                  const inp = activityInputs(a);
                  const photos: string[] = a.photoUrls || [];
                  return (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(a.activityDate).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activityLabel(a.activityType)}</td>
                      <td style={{ fontSize: 12 }}>
                        {farmerName(a) || '—'}
                        {a.cropCycle?.farmer?.controlNumber && <div style={{ color: 'var(--neutral-500)' }}>{a.cropCycle.farmer.controlNumber}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {a.cropCycle ? <Link href={`/dashboard/crop-cycles/${a.cropCycle.id}`}>{a.cropCycle.farm?.farmCode ?? '—'}</Link> : '—'}
                        <div style={{ color: 'var(--neutral-500)' }}>{a.plot ? a.plot.plotCode : 'Whole farm'} · {a.cropCycle?.season ?? '—'}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{inp.text || '—'}</td>
                      <td className="num" style={{ fontSize: 12 }}>{inp.quantity || '—'}</td>
                      <td className="num" style={{ fontSize: 12 }}>{money(a.cost)}</td>
                      <td style={{ fontSize: 12 }}>{officerName(a) || '—'}</td>
                      <td>
                        {photos.length === 0 ? '—' : (
                          <button type="button" onClick={() => setLightbox(photos[0])} style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in', position: 'relative' }} aria-label="Open activity photo">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photos[0]} alt="Activity" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--neutral-200)' }} />
                            {photos.length > 1 && <span style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 10, background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '0 5px' }}>+{photos.length - 1}</span>}
                          </button>
                        )}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 220, color: 'var(--neutral-400)' }}>{a.remarks || a.description || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {canEdit && <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }} onClick={() => setEditor({ activity: a })}>Edit</button>}
                        {canDelete && <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--red-500)' }} onClick={() => remove(a.id)}>Delete</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !loadError && filtered.length > 0 && (
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

      {editor && (
        <ActivityEditorModal
          activity={editor.activity}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setMessage(editor.activity ? 'Activity updated.' : 'Activity recorded.'); load(); }}
        />
      )}
      {lightbox && (
        <div role="dialog" aria-label="Activity photo" onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Activity" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
