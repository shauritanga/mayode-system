'use client';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import Modal from '@/components/Modal';
import { authApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';

const EMPTY = { firstName: '', lastName: '', phone: '', email: '', password: '' };

/**
 * Super Admin registers the administrator of one cooperative. That person then creates their
 * own roles and staff from the cooperatives portal, confined to this AMCOS.
 */
export default function CooperativeAdminModal({
  mamcos,
  onClose,
  onCreated,
}: {
  mamcos: { id: string; name: string };
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await authApi.createCooperativeAdmin({
        mamcosId: mamcos.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      });
      onCreated(`Administrator ${`${form.firstName} ${form.lastName}`.trim()} added to ${mamcos.name}.`);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the administrator.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add cooperative administrator"
      subtitle={`Manages the roles and staff of ${mamcos.name} only.`}
      onClose={onClose}
      width="520px"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="coop-admin-form" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create administrator'}</button>
        </>
      }
    >
      <form id="coop-admin-form" className="ua-form" onSubmit={submit}>
        <div className="ua-role-note">
          They sign in to the Cooperative Portal and create their own roles and team. They can only grant permissions
          they hold, and never see other cooperatives.
        </div>
        <div className="ua-row">
          <div className="ua-field">
            <label className="ua-label" htmlFor="ca-first">First name</label>
            <input id="ca-first" className="input-field" required autoComplete="off" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </div>
          <div className="ua-field">
            <label className="ua-label" htmlFor="ca-last">Last name</label>
            <input id="ca-last" className="input-field" required autoComplete="off" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
        </div>
        <div className="ua-field">
          <label className="ua-label" htmlFor="ca-phone">Phone number</label>
          <input id="ca-phone" className="input-field" type="tel" required autoComplete="off" placeholder="+255 7XX XXX XXX" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <span className="ua-hint">This is their sign-in name.</span>
        </div>
        <div className="ua-field">
          <label className="ua-label" htmlFor="ca-email">Email<span className="ua-opt">optional</span></label>
          <input id="ca-email" className="input-field" type="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="ua-field">
          <label className="ua-label" htmlFor="ca-password">Temporary password</label>
          <div className="ua-input-wrap">
            <input id="ca-password" className="input-field" required minLength={6} autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="ua-reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              <HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} size={18} strokeWidth={1.8} />
            </button>
          </div>
          <span className="ua-hint">At least 6 characters. Share it securely.</span>
        </div>
        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
