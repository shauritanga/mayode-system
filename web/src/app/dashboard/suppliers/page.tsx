'use client';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { suppliersApi } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  itemsSupplied: string[];
  isActive: boolean;
  _count?: { inputCosts: number };
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', contactPerson: '', contactPhone: '', contactEmail: '', itemsSupplied: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    suppliersApi.getAll()
      .then((res) => setSuppliers(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await suppliersApi.create({
        name: form.name,
        contactPerson: form.contactPerson || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        itemsSupplied: form.itemsSupplied ? form.itemsSupplied.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      setForm({ name: '', contactPerson: '', contactPhone: '', contactEmail: '', itemsSupplied: '' });
      setMessage('Supplier added.');
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to add supplier.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (supplier: Supplier) => {
    try {
      await suppliersApi.update(supplier.id, { isActive: !supplier.isActive });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    setMessage('');
    try {
      await suppliersApi.remove(id);
      setMessage('Supplier deleted.');
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'A supplier with recorded input costs cannot be deleted; deactivate it instead.');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Input Management</div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">Supplier directory for input distribution and cost tracking.</p>
        </div>
        <input
          type="search"
          placeholder="Search suppliers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <form onSubmit={create} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Add supplier</h2>
            <p className="panel-copy">Register a supplier so input costs can be linked to a real distribution record.</p>
          </div>
        </div>
        {message && <div className={`alert-box ${message.includes('Unable') || message.includes('cannot') ? 'alert-danger' : 'alert-success'}`}>{message}</div>}
        <div className="form-grid-wide">
          <label className="form-label">Name<input className="input-field" required value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></label>
          <label className="form-label">Contact person<input className="input-field" value={form.contactPerson} onChange={(e) => setForm((c) => ({ ...c, contactPerson: e.target.value }))} /></label>
          <label className="form-label">Phone<input className="input-field" value={form.contactPhone} onChange={(e) => setForm((c) => ({ ...c, contactPhone: e.target.value }))} /></label>
          <label className="form-label">Email<input className="input-field" type="email" value={form.contactEmail} onChange={(e) => setForm((c) => ({ ...c, contactEmail: e.target.value }))} /></label>
          <label className="form-label form-grid-wide">Items supplied, comma-separated<input className="input-field" placeholder="Fertilizer, Seeds, Pesticide" value={form.itemsSupplied} onChange={(e) => setForm((c) => ({ ...c, itemsSupplied: e.target.value }))} /></label>
        </div>
        <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving...' : 'Add supplier'}</button>
      </form>

      <div className="table-panel">
        <div className="section-toolbar"><strong>Suppliers</strong><span className="muted">{filtered.length} shown</span></div>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading suppliers…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No suppliers registered yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Items supplied</th>
                  <th>Input costs</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((supplier) => (
                  <tr key={supplier.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{supplier.name}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{supplier.contactPerson || '—'} · {supplier.contactPhone || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{supplier.itemsSupplied?.join(', ') || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{supplier._count?.inputCosts ?? 0}</td>
                    <td><span className={`badge ${supplier.isActive ? 'badge-green' : 'badge-gray'}`}>{supplier.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => toggleActive(supplier)}>{supplier.isActive ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--red-500)' }} onClick={() => remove(supplier.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
