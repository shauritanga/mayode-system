'use client';
import { useEffect, useState } from 'react';
import { buyersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';

interface Buyer {
  id: string;
  name: string;
  fairtradeCertNumber?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isCertified: boolean;
}

const EMPTY = { name: '', fairtradeCertNumber: '', contactPerson: '', contactEmail: '', contactPhone: '', isCertified: false };

export default function BuyersPage() {
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
    const payload = Object.fromEntries(
      Object.entries(form).filter(([k, v]) => k === 'name' || k === 'isCertified' || (typeof v === 'string' && v.trim())),
    );
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
  const rows = buyers.filter((b) => b.name.toLowerCase().includes(q) || (b.contactPerson ?? '').toLowerCase().includes(q));
  const field = (key: keyof typeof EMPTY, label: string, type = 'text') => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{label}</label>
      <input className="input-field" type={type} value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Buyers</h1>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Buyer directory and Fairtrade certification status</p>
        </div>
        {canCreate && <button className="btn-primary" onClick={() => openForm('new')}>+ New buyer</button>}
      </div>

      {error && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--red-400)', fontSize: '13px' }}>{error}</div>}

      <input className="input-field" type="search" placeholder="Search buyers…" value={search}
        onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: '16px', maxWidth: '320px' }} />

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)' }}>Loading buyers…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)' }}>No buyers found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Fairtrade cert.</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}</td>
                    <td>{b.contactPerson || '—'}<div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{b.contactEmail}</div></td>
                    <td>{b.contactPhone || '—'}</td>
                    <td>{b.fairtradeCertNumber || '—'}</td>
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
          {field('name', 'Name *')}
          {field('contactPerson', 'Contact person')}
          {field('contactEmail', 'Contact email', 'email')}
          {field('contactPhone', 'Contact phone', 'tel')}
          {field('fairtradeCertNumber', 'Fairtrade certificate number')}
          <label style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" checked={form.isCertified} onChange={(e) => setForm({ ...form, isCertified: e.target.checked })} />
            Fairtrade certified
          </label>
        </Modal>
      )}
    </div>
  );
}
