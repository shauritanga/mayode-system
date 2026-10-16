'use client';
import { useEffect, useState } from 'react';
import { inventoryApi, warehousesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

interface Centre {
  id: string; name: string; region?: string | null; district?: string | null; ward?: string | null; village?: string | null;
  contactPhone?: string | null; isActive: boolean; warehouseId?: string | null;
  warehouse?: { name: string } | null; mamcos?: { name: string } | null; _count?: { inventoryRecords: number };
}

export default function CollectionCentresPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, 'inventory', 'CREATE');
  const canEdit = hasPermission(user, 'inventory', 'EDIT');
  const [centres, setCentres] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ centre?: Centre } | null>(null);

  const load = () =>
    inventoryApi.centres()
      .then((r) => { setCentres(r.data || []); setError(''); })
      .catch((e) => setError(e?.response?.data?.message || 'Could not load collection centres.'))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 4, height: 26, background: 'linear-gradient(to bottom, var(--green-600), var(--accent))', borderRadius: 9999 }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Collection Centres</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginLeft: 14 }}>Places where farmers bring rice to be weighed, graded and bought</p>
        </div>
        {canCreate && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setEditor({})}>+ Add collection centre</button>}
      </div>

      <section className="glass-card farmers-workspace">
        {loading ? <TableSkeleton rows={4} avatar={false} /> : error ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--red-400)', fontSize: 14 }}>{error}</div>
        ) : centres.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>No collection centres yet.</div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr><th>Centre</th><th>Location</th><th>Phone</th><th>Delivers to</th><th className="num">Deliveries</th><th>Status</th>{canEdit && <th />}</tr>
              </thead>
              <tbody>
                {centres.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}{c.mamcos && <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{c.mamcos.name}</div>}</td>
                    <td style={{ fontSize: 12 }}>{[c.village, c.ward, c.district, c.region].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.contactPhone ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.warehouse?.name ?? '—'}</td>
                    <td className="num">{c._count?.inventoryRecords ?? 0}</td>
                    <td><span className={`badge ${c.isActive ? 'badge-green' : 'badge-gold'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                    {canEdit && <td><button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditor({ centre: c })}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editor && <CentreModal centre={editor.centre} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
    </div>
  );
}

function CentreModal({ centre, onClose, onSaved }: { centre?: Centre; onClose: () => void; onSaved: () => void }) {
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [v, setV] = useState({
    name: centre?.name ?? '', region: centre?.region ?? '', district: centre?.district ?? '', ward: centre?.ward ?? '', village: centre?.village ?? '',
    contactPhone: centre?.contactPhone ?? '', warehouseId: centre?.warehouseId ?? '', isActive: centre?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof v, value: string | boolean) => setV((p) => ({ ...p, [k]: value }));
  useEffect(() => { warehousesApi.list().then((r) => setWarehouses((r.data || []).filter((w: { isActive: boolean }) => w.isActive))).catch(() => setWarehouses([])); }, []);

  const save = async () => {
    if (!v.name.trim()) return setError('Enter the centre name.');
    setSaving(true);
    const body = { name: v.name.trim(), region: v.region.trim() || undefined, district: v.district.trim() || undefined, ward: v.ward.trim() || undefined, village: v.village.trim() || undefined, contactPhone: v.contactPhone.trim() || undefined, warehouseId: v.warehouseId || null, isActive: v.isActive };
    try {
      if (centre) await inventoryApi.updateCentre(centre.id, body);
      else await inventoryApi.createCentre(body);
      onSaved();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Could not save.');
      setSaving(false);
    }
  };
  const text = (label: string, key: 'name' | 'region' | 'district' | 'ward' | 'village' | 'contactPhone', wide?: boolean) => (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}><label style={labelStyle}>{label}</label><input className="input-field" value={v[key]} onChange={(e) => set(key, e.target.value)} /></div>
  );
  return (
    <Modal title={centre ? 'Edit collection centre' : 'Add collection centre'} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
      {error && <div className="alert-box alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {text('Name', 'name', true)}
        {text('Region', 'region')}{text('District', 'district')}
        {text('Ward', 'ward')}{text('Village', 'village')}
        {text('Contact phone', 'contactPhone')}
        <div>
          <label style={labelStyle}>Delivers to warehouse</label>
          <select className="input-field" value={v.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}>
            <option value="">None</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {centre && (
          <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={v.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active (inactive centres are hidden from the intake form)
          </label>
        )}
      </div>
    </Modal>
  );
}
