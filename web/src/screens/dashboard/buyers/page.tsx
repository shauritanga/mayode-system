'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { useEffect, useState } from 'react';
import { buyersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';
import { BUSINESS_TYPES, businessTypeLabel, kg, tzs } from '../market/format';

interface Buyer {
  id: string;
  name: string;
  fairtradeCertNumber?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isCertified: boolean;
  businessType?: string | null;
  region?: string | null;
  district?: string | null;
  location?: string | null;
  deliveryLocation?: string | null;
  preferredVarieties?: string[];
  notes?: string | null;
  stats?: { soldKg: number; soldValue: number; outstanding: number; openOrders: number; requiredKg: number; activeAgreements: number };
}

const EMPTY = { name: '', businessType: '', fairtradeCertNumber: '', contactPerson: '', contactEmail: '', contactPhone: '', region: '', district: '', location: '', deliveryLocation: '', preferredVarieties: '', notes: '', isCertified: false };

export default function BuyersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, 'buyers', 'CREATE');
  const canEdit = hasPermission(user, 'buyers', 'EDIT');
  const canDelete = hasPermission(user, 'buyers', 'DELETE');

  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Buyer | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchBuyers = () =>
    buyersApi.list()
      .then((res) => { setBuyers(res.data || []); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Failed to load buyers')))
      .finally(() => setLoading(false));
  const load = () => { setLoading(true); fetchBuyers(); };
  useEffect(() => { fetchBuyers(); }, []);

  const openForm = (b: Buyer | 'new') => {
    setFormError('');
    setForm(b === 'new' ? EMPTY : {
      name: b.name,
      businessType: b.businessType ?? '',
      region: b.region ?? '',
      district: b.district ?? '',
      location: b.location ?? '',
      deliveryLocation: b.deliveryLocation ?? '',
      preferredVarieties: (b.preferredVarieties ?? []).join(', '),
      notes: b.notes ?? '',
      fairtradeCertNumber: b.fairtradeCertNumber ?? '',
      contactPerson: b.contactPerson ?? '',
      contactEmail: b.contactEmail ?? '',
      contactPhone: b.contactPhone ?? '',
      isCertified: b.isCertified,
    });
    setEditing(b);
  };

  const save = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    // Empty optional strings would fail @IsEmail / be stored as blanks.
    const { preferredVarieties, ...rest } = form;
    const payload: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([k, v]) => k === 'name' || k === 'isCertified' || (typeof v === 'string' && v.trim())),
    );
    payload.preferredVarieties = preferredVarieties.split(',').map((v) => v.trim()).filter(Boolean);
    setSaving(true); setFormError('');
    try {
      if (editing === 'new') await buyersApi.create(payload);
      else if (editing) await buyersApi.update(editing.id, payload);
      setEditing(null);
      load();
    } catch (e) {
      setFormError(apiErrorMessage(e, 'Failed to save buyer'));
    } finally { setSaving(false); }
  };

  const remove = async (b: Buyer) => {
    if (!window.confirm(`Delete buyer "${b.name}"?`)) return;
    try { await buyersApi.remove(b.id); load(); }
    catch (e) { setError(apiErrorMessage(e, 'Failed to delete buyer')); }
  };

  const q = search.toLowerCase();
  const rows = buyers.filter((b) => b.name.toLowerCase().includes(q) || (b.contactPerson ?? '').toLowerCase().includes(q) || (b.district ?? '').toLowerCase().includes(q) || (b.location ?? '').toLowerCase().includes(q));
  const field = (key: keyof typeof EMPTY, label: string, type = 'text') => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{label}</label>
      <input className="input-field" type={type} value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: embedded ? 'flex-end' : 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        {!embedded && <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Buyers</h1>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Buyer directory and Fairtrade certification status</p>
        </div>}
        {canCreate && <button className="btn-primary" onClick={() => openForm('new')}>+ New buyer</button>}
      </div>

      {error && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--red-400)', fontSize: '13px' }}>{error}</div>}

      <input className="input-field" type="search" placeholder="Search buyers…" value={search}
        onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: '16px', maxWidth: '320px' }} />

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <TableSkeleton rows={6} avatar={false} />
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)' }}>No buyers found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Buyer</th><th>Business type</th><th>Contact</th><th>Location</th><th>Preferred varieties</th><th>Open orders</th><th>Sales</th><th>Owes</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}<div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{b.fairtradeCertNumber || ''}</div></td>
                    <td>{businessTypeLabel(b.businessType)}</td>
                    <td>{b.contactPerson || '—'}<div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{b.contactPhone || b.contactEmail}</div></td>
                    <td>{[b.location, b.district, b.region].filter(Boolean).join(', ') || '—'}<div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{b.deliveryLocation ? `Delivery: ${b.deliveryLocation}` : ''}</div></td>
                    <td>{(b.preferredVarieties ?? []).join(', ') || '—'}</td>
                    <td>{b.stats?.openOrders ? <>{b.stats.openOrders} · {kg(b.stats.requiredKg)}</> : '—'}</td>
                    <td>{b.stats?.soldValue ? <>{tzs(b.stats.soldValue)}<div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{kg(b.stats.soldKg)}</div></> : '—'}</td>
                    <td style={{ color: b.stats?.outstanding ? 'var(--gold-400)' : undefined }}>{b.stats?.outstanding ? tzs(b.stats.outstanding) : '—'}</td>
                    <td><span className={`badge ${b.isCertified ? 'badge-green' : 'badge-gray'}`}>{b.isCertified ? 'Certified' : 'Not certified'}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {canEdit && <button className="btn-secondary" onClick={() => openForm(b)}>Edit</button>}{' '}
                      {canDelete && <button className="btn-secondary" onClick={() => remove(b)}>Delete</button>}
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
          title={editing === 'new' ? 'New buyer' : 'Edit buyer'}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}
        >
          {formError && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginBottom: '12px' }}>{formError}</div>}
          {field('name', 'Buyer / business name *')}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>Business type</label>
            <select className="input-field" value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
              <option value="">Select…</option>
              {BUSINESS_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {field('contactPerson', 'Contact person')}
          {field('contactEmail', 'Contact email', 'email')}
          {field('contactPhone', 'Contact phone', 'tel')}
          {field('region', 'Region')}
          {field('district', 'District')}
          {field('location', 'Location (town / address)')}
          {field('deliveryLocation', 'Usual delivery location')}
          {field('preferredVarieties', 'Preferred varieties (comma separated)')}
          {field('fairtradeCertNumber', 'Fairtrade certificate number')}
          {field('notes', 'Notes')}
          <label style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" checked={form.isCertified} onChange={(e) => setForm({ ...form, isCertified: e.target.checked })} />
            Fairtrade certified
          </label>
        </Modal>
      )}
    </div>
  );
}
