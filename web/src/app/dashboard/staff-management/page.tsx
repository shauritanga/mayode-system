'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi, mamcosApi, rolesApi } from '@/lib/api';

const SYSTEM_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'FARMER',
  'MAMCOS_SECRETARY', 'AUDITOR', 'BUYER', 'FINANCIAL_PROVIDER',
];

interface CustomRole {
  id: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
}

interface Mamcos {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  firstName: '', lastName: '', phone: '', email: '', password: '',
  role: 'FIELD_OFFICER', roleId: '', mamcosId: '', assignedArea: '', language: 'sw',
};

export default function StaffManagementPage() {
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [mamcosList, setMamcosList] = useState<Mamcos[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    rolesApi.getAll()
      .then((res) => setCustomRoles((res.data || []).filter((r: CustomRole) => !r.isSystem && r.isActive)))
      .catch(() => {});
    mamcosApi.getAll().then((res) => {
      const raw = res.data;
      setMamcosList(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }).catch(() => {});
  }, []);

  const needsMamcos = form.role === 'FIELD_OFFICER' || form.role === 'MAMCOS_SECRETARY';

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      await authApi.createStaff({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email || undefined,
        password: form.password,
        role: form.role,
        roleId: form.roleId || undefined,
        mamcosId: needsMamcos ? (form.mamcosId || undefined) : undefined,
        assignedArea: form.role === 'FIELD_OFFICER' ? (form.assignedArea || undefined) : undefined,
        language: form.language,
      });
      setMessage(`Staff account created for ${form.firstName} ${form.lastName}.`);
      setForm({ ...EMPTY_FORM });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not create staff account.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-shell">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Create Staff</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Provision a staff account and assign its system role and, optionally, a custom permission role</p>
        </div>
        <Link href="/dashboard/users" className="btn-secondary" style={{ textDecoration: 'none' }}>View all accounts</Link>
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--accent)' }}>{message}</div>}

      <div className="glass-card" style={{ padding: 24, maxWidth: 640 }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="input-field" placeholder="First name" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            <input className="input-field" placeholder="Last name" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
          <input className="input-field" placeholder="Phone +255…" required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <input className="input-field" type="email" placeholder="Email (optional)" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={form.password} onChange={(e) => set('password', e.target.value)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--neutral-400)', fontWeight: 600 }}>System role</span>
              <select className="input-field" value={form.role} onChange={(e) => set('role', e.target.value)}>
                {SYSTEM_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--neutral-400)', fontWeight: 600 }}>Custom role (optional)</span>
              <select className="input-field" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
                <option value="">None</option>
                {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>

          {needsMamcos && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--neutral-400)', fontWeight: 600 }}>AMCOS</span>
              <select className="input-field" required value={form.mamcosId} onChange={(e) => set('mamcosId', e.target.value)}>
                <option value="">Select AMCOS…</option>
                {mamcosList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}

          {form.role === 'FIELD_OFFICER' && (
            <input className="input-field" placeholder="Assigned area (optional)" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} />
          )}

          {error && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}

          <button type="submit" className="btn-primary" disabled={creating} style={{ justifySelf: 'start' }}>
            {creating ? 'Creating…' : 'Create staff account'}
          </button>
        </form>
      </div>
    </div>
  );
}
