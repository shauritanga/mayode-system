'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { staffApi, usersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, FormGrid, LoadError, Notice, PageHeader, StatCard, TableSkeleton, errMsg, fmtDate, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';

const KINDS: Record<string, { label: string; tone: string }> = {
  ADMIN: { label: 'AMCOS admin', tone: 'badge-purple' },
  SECRETARY: { label: 'AMCOS leader', tone: 'badge-purple' },
  FIELD_OFFICER: { label: 'Field officer', tone: 'badge-blue' },
  CANAL_LEADER: { label: 'Canal leader', tone: 'badge-green' },
  BLOCK_LEADER: { label: 'Block leader', tone: 'badge-green' },
  STAFF: { label: 'Staff', tone: 'badge-gray' },
};

const lastSeen = (value?: string | null) => (value ? fmtDate(value) : 'Never');

function AddStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string, password?: string) => void }) {
  const [type, setType] = useState<'FIELD_OFFICER' | 'GENERAL'>('GENERAL');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', roleId: '', assignedArea: '', language: 'sw' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const roles = useApi<any[]>(() => staffApi.roleOptions(), []);
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const save = async () => {
    const found: Record<string, string> = {};
    if (!form.firstName.trim()) found.firstName = 'First name is required';
    if (!form.lastName.trim()) found.lastName = 'Last name is required';
    if (!/^\+?[0-9\s-]{9,15}$/.test(form.phone.trim())) found.phone = 'Enter a valid phone number, e.g. +255712345678';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address';
    if (type === 'GENERAL' && !form.roleId) found.roleId = 'Choose a role';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    try {
      const res = await staffApi.create({
        staffType: type, firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(),
        email: form.email.trim() || undefined, roleId: form.roleId || undefined,
        assignedArea: type === 'FIELD_OFFICER' ? form.assignedArea.trim() || undefined : undefined, language: form.language,
      });
      onCreated(res.data.credentialsSms === 'sent' ? `${form.firstName.trim()} was added. Sign-in details were sent by SMS.` : `${form.firstName.trim()} was added, but the SMS could not be sent.`, res.data.temporaryPassword);
    } catch (e) { setError(errMsg(e, 'Could not add this staff member.')); setSaving(false); }
  };

  return (
    <Modal title="Add staff" subtitle="They get a login for the AMCOS portal with a temporary password sent by SMS." onClose={() => !saving && onClose()} width="600px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="staff-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add staff'}</button></>}>
      <form id="staff-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Type" wide>
            <select className="input-field" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="GENERAL">Staff with a role</option>
              <option value="FIELD_OFFICER">Field officer</option>
            </select>
          </Field>
          <Field label="First name *" error={errors.firstName}><input className="input-field" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name *" error={errors.lastName}><input className="input-field" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
          <Field label="Phone *" error={errors.phone} hint="This is their sign-in"><input className="input-field" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+255712345678" /></Field>
          <Field label="Email" error={errors.email}><input className="input-field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label={type === 'GENERAL' ? 'Role *' : 'Role'} error={errors.roleId} hint={type === 'FIELD_OFFICER' ? 'Leave empty for the standard Field Officer role' : 'Controls what they can open and do'}>
            <select className="input-field" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
              <option value="">{roles.loading ? 'Loading…' : type === 'FIELD_OFFICER' ? 'Field Officer (default)' : 'Select role'}</option>
              {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          {type === 'FIELD_OFFICER' && <Field label="Assigned area"><input className="input-field" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} placeholder="e.g. Block C01–C03" /></Field>}
          <Field label="SMS language"><select className="input-field" value={form.language} onChange={(e) => set('language', e.target.value)}><option value="sw">Kiswahili</option><option value="en">English</option></select></Field>
        </FormGrid>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Canal and block leaders are not added here. They become staff automatically when you appoint them in Scheme Management.</p>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

export default function StaffPage() {
  const me = useAuthStore((s) => s.user);
  const can = useCan();
  const [filters, setFilters] = useState({ q: '', kind: '', status: '' });
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const { data, loading, error, reload } = useApi<any>(() => staffApi.list(params), [JSON.stringify(filters)]);
  const [adding, setAdding] = useState(false);
  const [toggle, setToggle] = useState<any>(null);
  const [reset, setReset] = useState<any>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string; password?: string } | null>(null);
  const s = data?.summary;
  const rows: any[] = data?.data ?? [];
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div>
      <PageHeader title="Staff" subtitle="Everyone who works for your AMCOS: administrators, field officers and the canal and block leaders currently in office."
        actions={<>
          {can('irrigation_leadership', 'CREATE') && <Link className="btn-secondary" href="/dashboard/irrigation/leadership/assignments">Appoint leaders</Link>}
          {can('users', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add staff</button>}
        </>} />

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}{notice.password && <> Give them this temporary password: <strong style={{ fontFamily: 'monospace' }}>{notice.password}</strong> (shown once).</>}
        </Notice>
      )}
      <LoadError message={error} onRetry={reload} />

      {s && (
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <StatCard label="Staff" value={s.total} hint={`${s.active} active`} />
          <StatCard label="Field officers" value={s.fieldOfficers} />
          <StatCard label="Canal leaders" value={s.canalLeaders} />
          <StatCard label="Block leaders" value={s.blockLeaders} />
          <StatCard label="Never signed in" value={s.neverSignedIn} tone={s.neverSignedIn ? 'warn' : 'good'} />
        </div>
      )}

      <section className="table-panel">
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Name, phone, role, canal or block" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></Field>
          <Field label="Type">
            <select className="input-field" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
              <option value="">All</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        </Filters>
        {loading && !data ? <TableSkeleton cols={7} /> : !rows.length ? (
          <Empty title={filtered ? 'No staff match these filters' : 'No staff yet'} hint={filtered ? undefined : 'Add staff, or appoint canal and block leaders in Scheme Management.'}
            action={!filtered && can('users', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add staff</button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Type</th><th>Role</th><th>Phone</th><th>Assignment</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const kind = KINDS[r.kind] ?? KINDS.STAFF;
                  const self = r.isYou || r.id === me?.id;
                  return (
                    <tr key={r.id}>
                      <td><div style={{ fontWeight: 600 }}>{r.name}{self && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</div>{(r.employeeCode || r.memberNumber) && <div className="muted" style={{ fontSize: 11 }}>{r.employeeCode ?? `Member ${r.memberNumber}`}</div>}</td>
                      <td><span className={`badge ${kind.tone}`}>{kind.label}</span></td>
                      <td>{r.roleName ?? '—'}</td>
                      <td>{r.phone}</td>
                      <td>{r.assignment.length ? r.assignment.map((a: string) => <div key={a} style={{ fontSize: 12 }}>{a}</div>) : <span className="muted">—</span>}</td>
                      <td>{lastSeen(r.lastLoginAt)}{r.mustChangePassword && <div className="muted" style={{ fontSize: 11 }}>Temporary password</div>}</td>
                      <td><span className={`badge ${r.isActive ? 'badge-green' : 'badge-gray'}`}>{r.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {can('users', 'EDIT') && !self && <>
                          <button type="button" className="btn-secondary" onClick={() => setReset(r)}>Reset login</button>{' '}
                          <button type="button" className="btn-secondary" onClick={() => setToggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && <AddStaffModal onClose={() => setAdding(false)} onCreated={(text, password) => { setAdding(false); setNotice({ tone: password ? 'error' : 'success', text, password }); reload(); }} />}
      {toggle && (
        <ConfirmDialog title={toggle.isActive ? `Deactivate ${toggle.name}` : `Activate ${toggle.name}`} danger={toggle.isActive}
          confirmLabel={toggle.isActive ? 'Deactivate' : 'Activate'}
          body={toggle.isActive
            ? <>{toggle.name} will no longer be able to sign in. Their records and history are kept, and you can activate them again later.{toggle.kind === 'CANAL_LEADER' || toggle.kind === 'BLOCK_LEADER' ? ' Their leader appointment is not ended; end it in Scheme Management if they are leaving the role.' : ''}</>
            : <>{toggle.name} will be able to sign in again.</>}
          onConfirm={async () => { await usersApi.update(toggle.id, { isActive: !toggle.isActive }); setNotice({ tone: 'success', text: `${toggle.name} is now ${toggle.isActive ? 'inactive' : 'active'}.` }); reload(); }}
          onClose={() => setToggle(null)} />
      )}
      {reset && (
        <ConfirmDialog title={`Reset login for ${reset.name}`} confirmLabel="Reset and send"
          body={<>This creates a new temporary password, signs {reset.name} out everywhere and sends the new details by SMS to {reset.phone}. They must choose their own password at the next sign-in.</>}
          onConfirm={async () => {
            const res = await staffApi.resetCredentials(reset.id);
            setNotice(res.data.credentialsSms === 'sent'
              ? { tone: 'success', text: `New sign-in details were sent to ${reset.name}.` }
              : { tone: 'error', text: `The SMS to ${reset.name} could not be sent.`, password: res.data.temporaryPassword });
            reload();
          }}
          onClose={() => setReset(null)} />
      )}
    </div>
  );
}
