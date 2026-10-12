'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { useEffect, useState } from 'react';
import { facilitiesApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';

type Kind = 'irrigation' | 'centres';
type Row = Record<string, string | number | boolean | null | undefined> & { id: string; name: string };

interface FieldDef { key: string; label: string; number?: boolean }

const CONFIG: Record<Kind, {
  title: string;
  fields: FieldDef[];
  list: () => Promise<{ data: Row[] }>;
  create: (d: object) => Promise<unknown>;
  update: (id: string, d: object) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}> = {
  irrigation: {
    title: 'Irrigation schemes',
    fields: [
      { key: 'name', label: 'Name *' },
      { key: 'schemeType', label: 'Scheme type' },
      { key: 'waterSource', label: 'Water source' },
      { key: 'coverageHectares', label: 'Coverage (ha)', number: true },
    ],
    list: () => facilitiesApi.getIrrigationSchemes(),
    create: facilitiesApi.createIrrigationScheme,
    update: facilitiesApi.updateIrrigationScheme,
    remove: facilitiesApi.removeIrrigationScheme,
  },
  centres: {
    title: 'Aggregation centres',
    fields: [
      { key: 'name', label: 'Name *' },
      { key: 'location', label: 'Location' },
      { key: 'capacityKg', label: 'Capacity (kg)', number: true },
      { key: 'contactPerson', label: 'Contact person' },
      { key: 'contactPhone', label: 'Contact phone' },
    ],
    list: () => facilitiesApi.getAggregationCentres(),
    create: facilitiesApi.createAggregationCentre,
    update: facilitiesApi.updateAggregationCentre,
    remove: facilitiesApi.removeAggregationCentre,
  },
};

export default function FacilitiesPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, 'facilities', 'CREATE');
  const canEdit = hasPermission(user, 'facilities', 'EDIT');
  const canDelete = hasPermission(user, 'facilities', 'DELETE');

  const [kind, setKind] = useState<Kind>('irrigation');
  const cfg = CONFIG[kind];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchRows = () =>
    cfg.list()
      .then((res) => { setRows(res.data || []); setError(''); })
      .catch((e) => { setRows([]); setError(apiErrorMessage(e, `Failed to load ${cfg.title.toLowerCase()}`)); })
      .finally(() => setLoading(false));
  const load = () => { setLoading(true); fetchRows(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(); }, [kind]);

  const openForm = (r: Row | 'new') => {
    setFormError('');
    setForm(r === 'new' ? {} : Object.fromEntries(cfg.fields.map((f) => [f.key, r[f.key] == null ? '' : String(r[f.key])])));
    setEditing(r);
  };

  const save = async () => {
    if (!form.name?.trim()) { setFormError('Name is required'); return; }
    const payload: Record<string, string | number> = {};
    for (const f of cfg.fields) {
      const v = (form[f.key] ?? '').trim();
      if (!v) continue;
      payload[f.key] = f.number ? Number(v) : v;
    }
    setSaving(true); setFormError('');
    try {
      if (editing === 'new') await cfg.create(payload);
      else if (editing) await cfg.update(editing.id, payload);
      setEditing(null);
      load();
    } catch (e) {
      setFormError(apiErrorMessage(e, 'Failed to save'));
    } finally { setSaving(false); }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete "${r.name}"?`)) return;
    try { await cfg.remove(r.id); load(); }
    catch (e) { setError(apiErrorMessage(e, 'Failed to delete')); }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Facilities</h1>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Irrigation schemes and aggregation centres</p>
        </div>
        {canCreate && <button className="btn-primary" onClick={() => openForm('new')}>+ New</button>}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(Object.keys(CONFIG) as Kind[]).map((k) => (
          <button key={k} className={kind === k ? 'btn-primary' : 'btn-secondary'} onClick={() => { if (k !== kind) { setRows([]); setLoading(true); setKind(k); } }}>{CONFIG[k].title}</button>
        ))}
      </div>

      {error && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--red-400)', fontSize: '13px' }}>{error}</div>}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)' }}>No records yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>{cfg.fields.map((f) => <th key={f.key}>{f.label.replace(' *', '')}</th>)}<th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {cfg.fields.map((f) => <td key={f.key}>{r[f.key] == null || r[f.key] === '' ? '—' : String(r[f.key])}</td>)}
                    <td><span className={`badge ${r.isActive === false ? 'badge-gray' : 'badge-green'}`}>{r.isActive === false ? 'Inactive' : 'Active'}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {canEdit && <button className="btn-secondary" onClick={() => openForm(r)}>Edit</button>}{' '}
                      {canDelete && <button className="btn-secondary" onClick={() => remove(r)}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={`${editing === 'new' ? 'New' : 'Edit'} ${kind === 'irrigation' ? 'irrigation scheme' : 'aggregation centre'}`}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}
        >
          {formError && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginBottom: '12px' }}>{formError}</div>}
          {cfg.fields.map((f) => (
            <div key={f.key} style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{f.label}</label>
              <input className="input-field" type={f.number ? 'number' : 'text'} value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
