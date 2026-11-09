'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { staffApi, usersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, FormGrid, LoadError, Notice, PageHeader, StatCard, TableSkeleton, errMsg, fmtDate, useApi, useCan, useDebounced,
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

/** Search the cooperative's registered farmers who are not staff yet. */
function FarmerPicker({ value, onChange, error }: { value: any; onChange: (f: any) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const term = useDebounced(q.trim(), 250);
  const found = useApi<any[]>(open ? () => staffApi.farmerCandidates(term) : null, [term, open]);
  const list = found.data ?? [];
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const label = (f: any) => `${f.name} · ${f.memberNumber}`;
  return (
    <Field label="Farmer *" error={error} wide hint="Their existing login is kept: same phone and password. They stay a farmer.">
      <div ref={box} style={{ position: 'relative' }}>
        <input className="input-field" role="combobox" aria-controls="staff-farmer-list" aria-expanded={open} aria-autocomplete="list" autoComplete="off"
          value={open ? q : value ? label(value) : ''} placeholder={value ? label(value) : 'Search by name, member number or phone'}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
        {open && (
          <div id="staff-farmer-list" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 240, overflowY: 'auto', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
            {found.loading && !list.length ? <div className="muted" style={{ padding: 12, fontSize: 13 }}>Loading farmers…</div>
              : !list.length ? <div className="muted" style={{ padding: 12, fontSize: 13 }}>{term ? 'No farmer of your AMCOS matches (farmers who are already staff are not listed).' : 'No farmers available.'}</div>
              : list.map((f) => (
                <button key={f.farmerId} type="button" role="option" aria-selected={value?.farmerId === f.farmerId} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(f); setOpen(false); setQ(''); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, borderBottom: '1px solid var(--border-subtle)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
                  <strong style={{ fontSize: 13.5 }}>{f.name}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>{f.memberNumber} · {f.phone}{f.village ? ` · ${f.village}` : ''}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </Field>
  );
}

function AddStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string, password?: string) => void }) {
  const [source, setSource] = useState<'NEW' | 'FARMER'>('NEW');
  const [farmer, setFarmer] = useState<any>(null);
  const [type, setType] = useState<'FIELD_OFFICER' | 'GENERAL'>('GENERAL');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', roleId: '', assignedArea: '', language: 'sw' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const roles = useApi<any[]>(() => staffApi.roleOptions(), []);
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const save = async () => {
    const found: Record<string, string> = {};
    if (source === 'FARMER') {
      if (!farmer) found.farmer = 'Choose a farmer';
      if (!form.roleId) found.roleId = 'Choose a role';
      setErrors(found);
      if (Object.keys(found).length) return;
      setSaving(true); setError('');
      try {
        const res = await staffApi.create({ farmerId: farmer.farmerId, staffType: 'GENERAL', roleId: form.roleId });
        onCreated(res.data.credentialsSms === 'sent' ? `${farmer.name} is now staff. They keep their usual phone and password; an SMS told them.` : `${farmer.name} is now staff, but the SMS could not be sent. Tell them to sign in with their usual phone and password.`);
      } catch (e) { setError(errMsg(e, 'Could not add this farmer as staff.')); setSaving(false); }
      return;
    }
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
    <Modal title="Add staff" subtitle={source === 'FARMER' ? 'The farmer keeps their login and can also sign in to the AMCOS portal.' : 'They get a login for the AMCOS portal with a temporary password sent by SMS.'} onClose={() => !saving && onClose()} width="600px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="staff-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add staff'}</button></>}>
      <form id="staff-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Who is this?" wide>
            <select className="input-field" value={source} onChange={(e) => { setSource(e.target.value as any); setErrors({}); if (e.target.value === 'FARMER') setType('GENERAL'); }}>
              <option value="NEW">A new person</option>
              <option value="FARMER">A registered farmer of this AMCOS</option>
            </select>
          </Field>
          {source === 'FARMER' && <FarmerPicker value={farmer} onChange={(f) => { setFarmer(f); setErrors((x) => ({ ...x, farmer: '' })); }} error={errors.farmer} />}
          {source === 'NEW' && <Field label="Type" wide>
            <select className="input-field" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="GENERAL">Staff with a role</option>
              <option value="FIELD_OFFICER">Field officer</option>
            </select>
          </Field>}
          {source === 'NEW' && <><Field label="First name *" error={errors.firstName}><input className="input-field" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name *" error={errors.lastName}><input className="input-field" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
          <Field label="Phone *" error={errors.phone} hint="This is their sign-in"><input className="input-field" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+255712345678" /></Field>
          <Field label="Email" error={errors.email}><input className="input-field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field></>}
          <Field label={type === 'GENERAL' ? 'Role *' : 'Role'} error={errors.roleId} hint={type === 'FIELD_OFFICER' ? 'Leave empty for the standard Field Officer role' : 'Controls what they can open and do'}>
            <select className="input-field" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
              <option value="">{roles.loading ? 'Loading…' : type === 'FIELD_OFFICER' ? 'Field Officer (default)' : 'Select role'}</option>
              {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          {source === 'NEW' && type === 'FIELD_OFFICER' && <Field label="Assigned area"><input className="input-field" value={form.assignedArea} onChange={(e) => set('assignedArea', e.target.value)} placeholder="e.g. Block C01–C03" /></Field>}
          {source === 'NEW' && <Field label="SMS language"><select className="input-field" value={form.language} onChange={(e) => set('language', e.target.value)}><option value="sw">Kiswahili</option><option value="en">English</option></select></Field>}
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
  const [removing, setRemoving] = useState<any>(null);
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
                      <td><span className={`badge ${kind.tone}`}>{kind.label}</span>{r.alsoFarmer && <div className="muted" style={{ fontSize: 11 }}>Also a farmer</div>}</td>
                      <td>{r.roleName ?? '—'}</td>
                      <td>{r.phone}</td>
                      <td>{r.assignment.length ? r.assignment.map((a: string) => <div key={a} style={{ fontSize: 12 }}>{a}</div>) : <span className="muted">—</span>}</td>
                      <td>{lastSeen(r.lastLoginAt)}{r.mustChangePassword && <div className="muted" style={{ fontSize: 11 }}>Temporary password</div>}</td>
                      <td><span className={`badge ${r.isActive ? 'badge-green' : 'badge-gray'}`}>{r.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {can('users', 'EDIT') && !self && (r.alsoFarmer
                          // Their login is also their farmer login, so it is never reset or switched off from here.
                          ? (r.kind === 'CANAL_LEADER' || r.kind === 'BLOCK_LEADER' ? null : <button type="button" className="btn-secondary" onClick={() => setRemoving(r)}>Remove staff access</button>)
                          : <>
                            <button type="button" className="btn-secondary" onClick={() => setReset(r)}>Reset login</button>{' '}
                            <button type="button" className="btn-secondary" onClick={() => setToggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
                          </>)}
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
      {removing && (
        <ConfirmDialog title={`Remove staff access for ${removing.name}`} danger confirmLabel="Remove staff access"
          body={<>{removing.name} will no longer be able to open the AMCOS portal as staff. They stay a registered farmer and keep their login, farms and records.</>}
          onConfirm={async () => { await staffApi.removeAccess(removing.id); setNotice({ tone: 'success', text: `${removing.name} is no longer staff. They are still a farmer.` }); reload(); }}
          onClose={() => setRemoving(null)} />
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
