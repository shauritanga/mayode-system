'use client';
import { useEffect, useState } from 'react';
import { fieldOfficersApi, locationsApi, mamcosApi, rolesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';

interface RoleOption { id: string; name: string; isActive: boolean; isSystem: boolean }
interface Created { employeeCode: string | null; credentialsSms: 'sent' | 'failed'; temporaryPassword?: string }

const EMPTY = { firstName: '', lastName: '', phone: '', email: '', region: '', district: '', assignedArea: '', roleId: '', language: 'sw', mamcosId: '' };

export default function AddOfficerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  // Super Admin (Mayode corporate) is not inside any cooperative, so chooses which one the officer joins.
  const isSuper = useAuthStore((st) => st.user?.role) === 'SUPER_ADMIN';
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    // A cooperative's own roles only exist for its administrator; Super Admin always gets the default Field Officer role.
    if (isSuper) {
      mamcosApi.getAll().then((res) => setCooperatives(res.data || [])).catch(() => setCooperatives([]));
    } else {
      rolesApi.getAll()
        .then((res) => setRoles((res.data as RoleOption[]).filter((r) => r.isActive && !r.isSystem)))
        .catch(() => setRoles([]));
    }
    locationsApi.getRegions().then((r) => setRegions(r.data || [])).catch(() => setRegions([]));
  }, [isSuper]);

  useEffect(() => {
    const region = regions.find((r) => r.name === form.region);
    if (!region) { setDistricts([]); return; }
    locationsApi.getDistricts(region.id).then((r) => setDistricts(r.data || [])).catch(() => setDistricts([]));
  }, [regions, form.region]);

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
          <button type="submit" form="add-officer-form" className="btn-primary" disabled={busy || !form.firstName || !form.lastName || !form.phone || (isSuper && !form.mamcosId)}>
            {busy ? 'Creating…' : 'Create and send SMS'}
          </button>
        </>
      }
    >
      <form id="add-officer-form" onSubmit={submit} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {error && <div className="alert-box alert-danger" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
        {isSuper && (
          <label className="form-label" style={{ gridColumn: '1 / -1' }}>Cooperative
            <select className="input-field" required value={form.mamcosId} onChange={(e) => set('mamcosId', e.target.value)}>
              <option value="">Choose the cooperative the officer will work for…</option>
              {cooperatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="form-label">First name<input className="input-field" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
        <label className="form-label">Last name<input className="input-field" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
        <label className="form-label">Phone number (receives the SMS)<input className="input-field" required type="tel" placeholder="+255…" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="form-label">Email (optional)<input className="input-field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="form-label">Assigned region
          <select className="input-field" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value, district: '' }))}>
            <option value="">Choose…</option>
            {regions.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
        </label>
        <label className="form-label">Assigned district
          <select className="input-field" value={form.district} disabled={!districts.length} onChange={(e) => set('district', e.target.value)}>
            <option value="">{districts.length ? 'Choose…' : 'Choose the region first'}</option>
            {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>Assigned area (wards or villages)<input className="input-field" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} /></label>
        {!isSuper && (
          <label className="form-label">Dashboard permissions
            <select className="input-field" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
              <option value="">Field Officer (recommended)</option>
              {roles.filter((r) => r.name !== 'Field Officer').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
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
