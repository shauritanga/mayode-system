'use client';
import { useEffect, useState } from 'react';
import { fieldOfficersApi, rolesApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';

interface RoleOption { id: string; name: string; isActive: boolean; isSystem: boolean }
interface Created { employeeCode: string | null; credentialsSms: 'sent' | 'failed'; temporaryPassword?: string }

const EMPTY = { firstName: '', lastName: '', phone: '', email: '', region: '', district: '', assignedArea: '', roleId: '', language: 'sw' };

export default function AddOfficerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    rolesApi.getAll()
      .then((res) => setRoles((res.data as RoleOption[]).filter((r) => r.isActive && !r.isSystem)))
      .catch(() => setRoles([]));
  }, []);

  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
      const res = await fieldOfficersApi.create(payload);
      setCreated(res.data as Created);
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the field officer.'));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal
        title="Field officer created"
        subtitle={created.employeeCode ? `Officer ID ${created.employeeCode}` : undefined}
        onClose={onClose}
        footer={<button className="btn-primary" onClick={onClose}>Done</button>}
      >
        {created.credentialsSms === 'sent' ? (
          <div className="alert-box alert-success">
            A text message with the phone number, a temporary password and sign-in instructions was sent to {form.phone}. They must choose their own password at first sign-in.
          </div>
        ) : (
          <div className="alert-box alert-danger">
            The account was created but the text message could not be sent. Give the officer these details yourself. This password is shown only once.
            <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 15 }}>
              {form.phone} / <strong>{created.temporaryPassword}</strong>
            </div>
            <div style={{ marginTop: 6, fontSize: 12 }}>You can also use “Resend credentials” on the officer’s page later.</div>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Add field officer"
      subtitle="We create the account and text the sign-in details to the officer."
      onClose={onClose}
      width="560px"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-officer-form" className="btn-primary" disabled={busy || !form.firstName || !form.lastName || !form.phone}>
            {busy ? 'Creating…' : 'Create and send SMS'}
          </button>
        </>
      }
    >
      <form id="add-officer-form" onSubmit={submit} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {error && <div className="alert-box alert-danger" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
        <label className="form-label">First name<input className="input-field" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
        <label className="form-label">Last name<input className="input-field" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
        <label className="form-label">Phone number (receives the SMS)<input className="input-field" required type="tel" placeholder="+255…" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="form-label">Email (optional)<input className="input-field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="form-label">Assigned region<input className="input-field" placeholder="e.g. Mbeya" value={form.region} onChange={(e) => set('region', e.target.value)} /></label>
        <label className="form-label">Assigned district<input className="input-field" placeholder="e.g. Mbarali" value={form.district} onChange={(e) => set('district', e.target.value)} /></label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>Assigned area (wards or villages)<input className="input-field" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} /></label>
        <label className="form-label">Dashboard permissions
          <select className="input-field" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
            <option value="">Field Officer (recommended)</option>
            {roles.filter((r) => r.name !== 'Field Officer').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="form-label">SMS language
          <select className="input-field" value={form.language} onChange={(e) => set('language', e.target.value)}>
            <option value="sw">Kiswahili</option>
            <option value="en">English</option>
          </select>
        </label>
      </form>
    </Modal>
  );
}
