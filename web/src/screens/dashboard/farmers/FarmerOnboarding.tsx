'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import Modal from '@/components/Modal';
import HectarePicker from './HectarePicker';
import { useSchemeScope } from '@/screens/dashboard/irrigation/useSchemeScope';
import { farmersApi, joinRequestsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, LoadError, MemberPicker, Notice, TableSkeleton, errMsg, fmtDate, useApi, useCan, type MemberLite,
} from '@/screens/dashboard/irrigation/ui';

function AddFarmerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string, password?: string) => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', village: '' });
  const [hectare, setHectare] = useState<{ id: string; code: string } | null>(null);
  const [guardian, setGuardian] = useState<MemberLite | null>(null);
  const { schemeId } = useSchemeScope();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const save = async () => {
    const found: Record<string, string> = {};
    if (!form.firstName.trim()) found.firstName = 'First name is required';
    if (!form.lastName.trim()) found.lastName = 'Last name is required';
    if (!/^\+?[0-9\s-]{9,15}$/.test(form.phone.trim())) found.phone = 'Enter a valid phone number, e.g. +255712345678';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address';
    if (!hectare) found.hectare = 'Choose the hectare this farmer holds';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    try {
      const res = await farmersApi.create({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(),
        email: form.email.trim() || undefined, village: form.village.trim() || undefined, hectareId: hectare!.id, guardianId: guardian?.id,
      });
      const name = form.firstName.trim();
      onCreated(res.data.credentialsSms === 'sent' ? `${name} was registered on hectare ${hectare!.code}. Sign-in details were sent by SMS.` : `${name} was registered on hectare ${hectare!.code}, but the SMS could not be sent.`, res.data.temporaryPassword);
    } catch (e) { setError(errMsg(e, 'Could not register this farmer.')); setSaving(false); }
  };

  return (
    <Modal title="Register farmer" subtitle="They get a temporary password by SMS." onClose={() => !saving && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="add-farmer-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Register farmer'}</button></>}>
      <form id="add-farmer-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 16px', alignItems: 'start' }}>
          <Field label="First name *" error={errors.firstName}><input className="input-field" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" /></Field>
          <Field label="Last name *" error={errors.lastName}><input className="input-field" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" /></Field>
          <Field label="Phone *" error={errors.phone}><input className="input-field" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+255712345678" autoComplete="off" /></Field>
          <Field label="Email" error={errors.email}><input className="input-field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Optional" autoComplete="off" /></Field>
          <Field label="Village"><input className="input-field" value={form.village} onChange={(e) => set('village', e.target.value)} placeholder="Optional" autoComplete="off" /></Field>
          <HectarePicker up value={hectare} onChange={(h) => { setHectare(h); setErrors((e) => ({ ...e, hectare: '' })); }} error={errors.hectare} />
          <div style={{ gridColumn: '1 / -1' }}>
            {hectare
              ? <MemberPicker schemeId={schemeId} value={guardian} onChange={setGuardian} label="Guardian (optional)" />
              : <Field label="Guardian (optional)" hint="Choose the hectare first."><input className="input-field" disabled placeholder="Search members" /></Field>}
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Use a guardian when this hectare is registered in {form.firstName.trim() || 'this farmer'}&apos;s name but really belongs to another member, such as a relative. It then shows on the guardian&apos;s page under &ldquo;Farms guided by this farmer&rdquo;.</p>
          </div>
        </div>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 12 }}>{error}</div>}
      </form>
    </Modal>
  );
}

/** The AMCOS code members use at sign-up, farmer registration, and the queue of people asking to join. */
export default function FarmerOnboarding({ onChanged }: { onChanged: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const inAmcos = !!user?.mamcosId;
  const requests = useApi<any>(inAmcos ? () => joinRequestsApi.list({ status: 'PENDING' }) : null, [inAmcos]);
  const [adding, setAdding] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [rejecting, setRejecting] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string; password?: string } | null>(null);
  if (!inAmcos) return null;

  const code = requests.data?.amcos?.code as string | undefined;
  const pending = requests.data?.pending ?? 0;
  const rows: any[] = requests.data?.data ?? [];
  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the code is still visible to copy by hand */ }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="glass-card" style={{ padding: '12px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Your AMCOS ID. Farmers enter it when they sign up to ask to join.</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface-tint)' }}>
            <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>{requests.loading ? '…' : code ?? 'Not set'}</code>
            {code && (
              <button type="button" onClick={copy} title={copied ? 'Copied' : 'Copy ID'} aria-label={copied ? 'Copied' : 'Copy AMCOS ID'}
                style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, border: 0, borderRadius: 6, background: 'transparent', color: copied ? 'var(--green-400, #34D399)' : 'var(--text-2)', cursor: 'pointer' }}>
                <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => setShowRequests((v) => !v)}>
            Join requests{pending ? ` (${pending})` : ''}
          </button>
          {can('farmers', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Register farmer</button>}
        </div>
      </div>

      {notice && (
        <div style={{ marginTop: 10 }}>
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}{notice.password && <> Give them this temporary password: <strong style={{ fontFamily: 'monospace' }}>{notice.password}</strong> (shown once).</>}
          </Notice>
        </div>
      )}
      <LoadError message={requests.error} onRetry={requests.reload} />

      {showRequests && (
        <section className="table-panel" style={{ marginTop: 10 }}>
          <div className="section-toolbar"><strong>People asking to join your AMCOS</strong></div>
          {requests.loading ? <TableSkeleton rows={3} cols={4} /> : !rows.length ? (
            <Empty title="No requests waiting" hint="When a farmer enters your code at sign-up, they appear here for you to approve." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Farmer</th><th>Phone</th><th>Village</th><th>Asked on</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><div style={{ fontWeight: 600 }}>{r.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{r.farmer.memberNumber}</div></td>
                      <td>{r.farmer.phone ?? '—'}</td><td>{r.farmer.village ?? '—'}</td><td>{fmtDate(r.createdAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {can('farmers', 'EDIT') && <>
                          <button type="button" className="btn-primary" onClick={async () => {
                            try { await joinRequestsApi.approve(r.id); setNotice({ tone: 'success', text: `${r.farmer.name} is now a member of your AMCOS.` }); requests.reload(); onChanged(); }
                            catch (e) { setNotice({ tone: 'error', text: errMsg(e, 'Could not approve this request.') }); }
                          }}>Approve</button>{' '}
                          <button type="button" className="btn-secondary" onClick={() => setRejecting(r)}>Reject</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {adding && <AddFarmerModal onClose={() => setAdding(false)} onCreated={(text, password) => { setAdding(false); setNotice({ tone: password ? 'error' : 'success', text, password }); requests.reload(); onChanged(); }} />}
      {rejecting && (
        <ConfirmDialog title={`Reject ${rejecting.farmer.name}`} danger askReason reasonLabel="Reason" confirmLabel="Reject request"
          body={<>{rejecting.farmer.name} stays an independent farmer and is told the request was not approved.</>}
          onConfirm={async (reason) => { await joinRequestsApi.reject(rejecting.id, reason); setNotice({ tone: 'success', text: 'Request rejected.' }); requests.reload(); }}
          onClose={() => setRejecting(null)} />
      )}
    </div>
  );
}
