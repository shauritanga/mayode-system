'use client';
import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import Modal from '@/components/Modal';
import { apiErrorMessage } from '@/lib/api-error';
import { authApi } from '@/lib/api';

export interface AssignableRole {
  id: string;
  name: string;
  /** Set when the role belongs to one cooperative; null/undefined for platform roles. */
  mamcosId?: string | null;
  mamcosName?: string | null;
}

type StaffType = '' | 'FIELD_OFFICER' | 'MAMCOS_SECRETARY';

const EMPTY_FORM = {
  firstName: '', lastName: '', phone: '', email: '', password: '',
  role: '', roleId: '', staffType: '' as StaffType, mamcosId: '', assignedArea: '', language: 'sw',
};

export default function CreateAccountModal({
  customRoles,
  isSuperAdmin,
  ownMamcosId,
  onClose,
  onCreated,
}: {
  customRoles: AssignableRole[];
  isSuperAdmin: boolean;
  /** The creator's own cooperative; set for cooperative admins, who can only create inside it. */
  ownMamcosId?: string | null;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isSuperAdminAccount = form.role === 'SUPER_ADMIN';
  const roleSelection = isSuperAdminAccount ? 'SUPER_ADMIN' : form.roleId;
  // Super Admin only creates platform accounts: a cooperative's team is created by its own
  // administrator. So Super Admin sees platform roles only, and cooperative admins see their own.
  const roles = useMemo(
    () => (isSuperAdmin ? customRoles.filter((r) => !r.mamcosId) : customRoles),
    [customRoles, isSuperAdmin],
  );

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roleId && !isSuperAdminAccount) { setError('Select a role first. Roles are created in Roles & Permissions.'); return; }
    setCreating(true);
    setError('');
    try {
      await authApi.createStaff({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        role: isSuperAdminAccount ? 'SUPER_ADMIN' : undefined,
        roleId: form.roleId || undefined,
        staffType: !isSuperAdmin && form.staffType ? form.staffType : undefined,
        assignedArea: !isSuperAdmin && form.staffType === 'FIELD_OFFICER' ? (form.assignedArea.trim() || undefined) : undefined,
        language: form.language,
      });
      onCreated(`${form.firstName} ${form.lastName}`.trim() || form.phone);
      onClose();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not create account.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      title="New account"
      subtitle={ownMamcosId ? 'Add a member of your cooperative’s team.' : 'Add a member of your team. Farmers register themselves in the mobile app.'}
      onClose={onClose}
      width="580px"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={creating}>Cancel</button>
          <button type="submit" form="create-account-form" className="btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="create-account-form" className="ua-form" onSubmit={submit}>
        <section className="ua-section" aria-labelledby="ua-sec-person">
          <h3 className="ua-section-title" id="ua-sec-person">Personal details</h3>
          <div className="ua-row">
            <div className="ua-field">
              <label className="ua-label" htmlFor="ua-first">First name</label>
              <input id="ua-first" className="input-field" autoComplete="off" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div className="ua-field">
              <label className="ua-label" htmlFor="ua-last">Last name</label>
              <input id="ua-last" className="input-field" autoComplete="off" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>
          </div>
          <div className="ua-field">
            <label className="ua-label" htmlFor="ua-phone">Phone number</label>
            <input id="ua-phone" className="input-field" type="tel" inputMode="tel" autoComplete="off" placeholder="+255 7XX XXX XXX" required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            <span className="ua-hint">This is the sign-in name for the account.</span>
          </div>
          <div className="ua-field">
            <label className="ua-label" htmlFor="ua-email">Email<span className="ua-opt">optional</span></label>
            <input id="ua-email" className="input-field" type="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </section>

        <section className="ua-section" aria-labelledby="ua-sec-signin">
          <h3 className="ua-section-title" id="ua-sec-signin">Sign-in</h3>
          <div className="ua-field">
            <label className="ua-label" htmlFor="ua-password">Temporary password</label>
            <div className="ua-input-wrap">
              <input id="ua-password" className="input-field" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} required value={form.password} onChange={(e) => set('password', e.target.value)} />
              <button type="button" className="ua-reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} size={18} strokeWidth={1.8} />
              </button>
            </div>
            <span className="ua-hint">At least 6 characters. Share it securely and ask them to change it after signing in.</span>
          </div>
        </section>

        <section className="ua-section" aria-labelledby="ua-sec-access">
          <h3 className="ua-section-title" id="ua-sec-access">Access</h3>
          <div className="ua-field">
            <label className="ua-label" htmlFor="ua-role">Role</label>
            <select id="ua-role" className="input-field" required value={roleSelection}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : '', roleId: e.target.value === 'SUPER_ADMIN' ? '' : e.target.value, staffType: e.target.value === 'SUPER_ADMIN' ? '' : f.staffType }))}>
              <option value="">Select a role…</option>
              {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin (built-in)</option>}
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {roles.length === 0 && (
              <span className="ua-hint">No roles yet. Create one in Roles &amp; Permissions first.</span>
            )}
          </div>
          {isSuperAdminAccount && (
            <div className="ua-role-note is-super">Super Admin has unrestricted access, including role management. Grant it sparingly.</div>
          )}
          {roleSelection && !isSuperAdminAccount && (
            <div className="ua-role-note">This account gets exactly the permissions ticked for the selected role.</div>
          )}

          {!isSuperAdmin && (
            <div className="ua-field">
              <label className="ua-label" htmlFor="ua-type">Position<span className="ua-opt">optional</span></label>
              <select id="ua-type" className="input-field" value={form.staffType} onChange={(e) => set('staffType', e.target.value)}>
                <option value="">Other staff</option>
                <option value="FIELD_OFFICER">Field officer</option>
                <option value="MAMCOS_SECRETARY">AMCOS secretary</option>
              </select>
              <span className="ua-hint">Field officers and secretaries also get a staff record in your cooperative.</span>
            </div>
          )}

          {!isSuperAdmin && (
            <div className="ua-role-note">This account will belong to your cooperative and sign in to the cooperatives portal.</div>
          )}

          {!isSuperAdmin && form.staffType === 'FIELD_OFFICER' && (
            <div className="ua-field">
              <label className="ua-label" htmlFor="ua-area">Assigned area<span className="ua-opt">optional</span></label>
              <input id="ua-area" className="input-field" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} />
            </div>
          )}
        </section>

        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
