'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { authApi, mamcosApi } from '@/lib/api';

interface CustomRole {
  id: string;
  name: string;
  systemRole?: string | null;
}

interface Mamcos {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  firstName: '', lastName: '', phone: '', email: '', password: '',
  role: '', roleId: '', mamcosId: '', assignedArea: '', language: 'sw',
};

export default function CreateAccountModal({
  customRoles,
  isSuperAdmin,
  onClose,
  onCreated,
}: {
  customRoles: CustomRole[];
  isSuperAdmin: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {

  const [mamcosList, setMamcosList] = useState<Mamcos[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    mamcosApi.getAll().then((res) => {
      const raw = res.data;
      setMamcosList(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }).catch(() => {});
  }, []);

  const profile = customRoles.find((r) => r.id === form.roleId)?.systemRole;
  const needsMamcos = profile === 'FIELD_OFFICER' || profile === 'MAMCOS_SECRETARY';
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    if (!form.roleId && form.role !== 'SUPER_ADMIN') { setError('Create a role in Roles & Permissions, then select it here.'); return; }
    setCreating(true);
    setError('');
    try {
      await authApi.createStaff({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email || undefined,
        password: form.password,
        role: form.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : undefined,
        roleId: form.roleId || undefined,
        mamcosId: needsMamcos ? (form.mamcosId || undefined) : undefined,
        assignedArea: profile === 'FIELD_OFFICER' ? (form.assignedArea || undefined) : undefined,
        language: form.language,
      });
      onCreated(`${form.firstName} ${form.lastName}`.trim() || form.phone);
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
          : undefined;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not create account.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      title="New account"
      subtitle="Choose Super Admin or a role you created in Roles & Permissions."
      onClose={onClose}
      width="560px"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={creating}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <input className="input-field" placeholder="First name" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          <input className="input-field" placeholder="Last name" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </div>
        <input className="input-field" placeholder="Phone +255…" required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <input className="input-field" type="email" placeholder="Email (optional)" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={form.password} onChange={(e) => set('password', e.target.value)} />

        <label style={{ display: 'grid', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Role</span>
          <select className="input-field" required value={form.role || form.roleId}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : '', roleId: e.target.value === 'SUPER_ADMIN' ? '' : e.target.value }))}>
            <option value="">Select a role…</option>
            <option value="SUPER_ADMIN">Super Admin (built-in)</option>
            {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {customRoles.length === 0 && <p>Create your first role in Roles &amp; Permissions to create a non-super-admin account.</p>}
        </label>

        {needsMamcos && (
          <label style={{ display: 'grid', gap: '5px' }}>
            <span style={{ fontSize: '12px', color: 'var(--neutral-400)', fontWeight: 600 }}>AMCOS</span>
            <select className="input-field" required value={form.mamcosId} onChange={(e) => set('mamcosId', e.target.value)}>
              <option value="">Select AMCOS…</option>
              {mamcosList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}

        {profile === 'FIELD_OFFICER' && (
          <input className="input-field" placeholder="Assigned area (optional)" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} />
        )}

        {error && <div style={{ color: 'var(--red-400)', fontSize: '13px' }}>{error}</div>}
      </form>
    </Modal>
  );
}
