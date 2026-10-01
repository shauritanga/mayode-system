'use client';
import { useEffect, useState } from 'react';
import { authApi, mamcosApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Secretary { firstName: string; lastName: string; user?: { phone: string } }
interface OfficerRow {
  id: string; employeeCode: string; firstName: string; lastName: string;
  assignedArea?: string; user?: { phone: string; isActive: boolean };
}

const EMPTY_OFFICER_FORM = { firstName: '', lastName: '', phone: '', password: '', assignedArea: '' };

export default function StaffPage() {
  const [mamcosName, setMamcosName] = useState('');
  const [secretary, setSecretary] = useState<Secretary | null>(null);
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOfficerForm, setShowOfficerForm] = useState(false);
  const [officerForm, setOfficerForm] = useState<any>({ ...EMPTY_OFFICER_FORM });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    mamcosApi.dashboard()
      .then(res => {
        const secretaryRow = res.data;
        const m = secretaryRow?.mamcos;
        setMamcosName(m?.name || '');
        setSecretary(secretaryRow ? { firstName: secretaryRow.firstName, lastName: secretaryRow.lastName, user: secretaryRow.user } : null);
        setOfficers(m?.fieldOfficers ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createOfficer = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMessage('');
    try {
      await authApi.createStaff({ ...officerForm, role: 'FIELD_OFFICER' });
      setMessage('Field Officer account created successfully.');
      setOfficerForm({ ...EMPTY_OFFICER_FORM });
      setShowOfficerForm(false);
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Could not create Field Officer account.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Staff</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>{mamcosName || 'Your AMCOS'} — leader and field officers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowOfficerForm(true)}>+ Add Field Officer</button>
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)' }}>{message}</div>}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading staff…</div>
      ) : (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {secretary && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface-tint)', borderRadius: '10px' }}>
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>🧑‍💼</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{secretary.firstName} {secretary.lastName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>AMCOS Leader (you) · {secretary.user?.phone || '—'}</div>
                </div>
              </div>
            )}
            {officers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--neutral-600)', fontSize: '14px', padding: '24px 0' }}>
                No field officers yet — use &quot;+ Add Field Officer&quot; above to add one.
              </div>
            ) : officers.map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface-tint)', borderRadius: '10px' }}>
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>🧑‍🌾</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.firstName} {o.lastName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>
                    {o.employeeCode} · {o.user?.phone || 'No phone'}{o.assignedArea ? ` · ${o.assignedArea}` : ''}
                  </div>
                </div>
                <span className={`badge ${o.user?.isActive !== false ? 'badge-green' : 'badge-gray'}`}>
                  {o.user?.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showOfficerForm && (
        <Modal
          title="Add Field Officer"
          onClose={() => setShowOfficerForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowOfficerForm(false)} disabled={creating}>Cancel</button>
              <button className="btn-primary" onClick={createOfficer} disabled={creating}>{creating ? 'Saving…' : 'Create staff account'}</button>
            </>
          }
        >
          <form onSubmit={createOfficer} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="First name" required value={officerForm.firstName} onChange={e => setOfficerForm({ ...officerForm, firstName: e.target.value })} />
            <input className="input-field" placeholder="Last name" required value={officerForm.lastName} onChange={e => setOfficerForm({ ...officerForm, lastName: e.target.value })} />
            <input className="input-field" placeholder="Phone +255…" required value={officerForm.phone} onChange={e => setOfficerForm({ ...officerForm, phone: e.target.value })} />
            <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={officerForm.password} onChange={e => setOfficerForm({ ...officerForm, password: e.target.value })} />
            <input className="input-field" placeholder="Assigned area" value={officerForm.assignedArea} onChange={e => setOfficerForm({ ...officerForm, assignedArea: e.target.value })} />
          </form>
        </Modal>
      )}
    </div>
  );
}
