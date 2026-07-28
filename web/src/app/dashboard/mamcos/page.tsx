'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi, mamcosApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/store/auth.store';

interface Mamcos {
  id: string;
  name: string;
  district?: string;
  location?: string;
  chairmanName?: string;
  chairmanPhone?: string;
  totalHectares?: number;
  isActive: boolean;
  _count?: { farmers: number; farms: number };
}

const EMPTY_LEADER_FORM = { firstName: '', lastName: '', phone: '', password: '', mamcosId: '' };
const EMPTY_OFFICER_FORM = { firstName: '', lastName: '', phone: '', password: '', assignedArea: '', mamcosId: '' };

export default function MamcosPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isSecretary = role === 'MAMCOS_SECRETARY';
  const [mamcos, setMamcos] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [showMamcosForm, setShowMamcosForm] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showOfficerForm, setShowOfficerForm] = useState(false);
  const [form, setForm] = useState<any>({ name: '', location: '', district: 'Mbarali', totalHectares: '' });
  const [staffForm, setStaffForm] = useState<any>({ ...EMPTY_LEADER_FORM });
  const [officerForm, setOfficerForm] = useState<any>({ ...EMPTY_OFFICER_FORM });

  // A Secretary only ever sees their own AMCOS, resolved server-side from
  // their own profile — never the full cooperative list.
  const load = () => {
    setLoading(true);
    if (isSecretary) {
      mamcosApi.dashboard()
        .then(res => {
          const m = res.data?.mamcos;
          const scoped: Mamcos[] = m ? [{ ...m, _count: { farmers: m.farmers?.length ?? 0, farms: m.farms?.length ?? 0 } }] : [];
          setMamcos(scoped);
          setOfficerForm((f: any) => ({ ...f, mamcosId: m?.id ?? '' }));
        })
        .catch(console.error).finally(() => setLoading(false));
    } else {
      mamcosApi.getAll()
        .then(res => setMamcos(res.data || []))
        .catch(console.error).finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSecretary]);

  const createMamcos = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMessage('');
    try { await mamcosApi.create({ ...form, totalHectares: form.totalHectares ? Number(form.totalHectares) : undefined }); setForm({ name: '', location: '', district: 'Mbarali', totalHectares: '' }); setMessage('AMCOS created successfully.'); setShowMamcosForm(false); load(); }
    catch (e: any) { setMessage(e?.response?.data?.message || 'Could not create AMCOS.'); } finally { setCreating(false); }
  };
  const createStaff = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMessage('');
    try { await authApi.createStaff({ ...staffForm, role: 'MAMCOS_SECRETARY' }); setMessage('AMCOS Leader account created successfully.'); setStaffForm({ ...EMPTY_LEADER_FORM }); setShowStaffForm(false); load(); }
    catch (e: any) { setMessage(e?.response?.data?.message || 'Could not create AMCOS Leader account.'); } finally { setCreating(false); }
  };
  const createOfficer = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMessage('');
    try {
      await authApi.createStaff({ ...officerForm, role: 'FIELD_OFFICER' });
      setMessage('Field Officer account created successfully.');
      setOfficerForm({ ...EMPTY_OFFICER_FORM, mamcosId: isSecretary ? officerForm.mamcosId : '' });
      setShowOfficerForm(false);
    }
    catch (e: any) { setMessage(e?.response?.data?.message || 'Could not create Field Officer account.'); } finally { setCreating(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>AMCOS Cooperatives</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>{isSecretary ? 'Your cooperative scheme' : 'Registered cooperative management schemes'}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isSecretary && <button className="btn-secondary" onClick={() => setShowStaffForm(true)}>+ Assign AMCOS Leader</button>}
          <button className="btn-secondary" onClick={() => setShowOfficerForm(true)}>+ Create Field Officer</button>
          {!isSecretary && <button className="btn-primary" onClick={() => setShowMamcosForm(true)}>+ New AMCOS</button>}
        </div>
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)' }}>{message}</div>}

      {showMamcosForm && (
        <Modal
          title="Create AMCOS"
          onClose={() => setShowMamcosForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowMamcosForm(false)} disabled={creating}>Cancel</button>
              <button className="btn-primary" onClick={createMamcos} disabled={creating}>{creating ? 'Saving…' : 'Create AMCOS'}</button>
            </>
          }
        >
          <form onSubmit={createMamcos} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="AMCOS name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="input-field" placeholder="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            <input className="input-field" placeholder="District" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} />
            <input className="input-field" type="number" placeholder="Hectares" value={form.totalHectares} onChange={e => setForm({ ...form, totalHectares: e.target.value })} />
          </form>
        </Modal>
      )}

      {showStaffForm && (
        <Modal
          title="Assign AMCOS Leader"
          onClose={() => setShowStaffForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowStaffForm(false)} disabled={creating}>Cancel</button>
              <button className="btn-primary" onClick={createStaff} disabled={creating}>{creating ? 'Saving…' : 'Create leader account'}</button>
            </>
          }
        >
          <form onSubmit={createStaff} style={{ display: 'grid', gap: '9px' }}>
            <select className="input-field" required value={staffForm.mamcosId} onChange={e => setStaffForm({ ...staffForm, mamcosId: e.target.value })}><option value="">Select AMCOS</option>{mamcos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <input className="input-field" placeholder="First name" required value={staffForm.firstName} onChange={e => setStaffForm({ ...staffForm, firstName: e.target.value })} />
            <input className="input-field" placeholder="Last name" required value={staffForm.lastName} onChange={e => setStaffForm({ ...staffForm, lastName: e.target.value })} />
            <input className="input-field" placeholder="Phone +255…" required value={staffForm.phone} onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })} />
            <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={staffForm.password} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} />
          </form>
        </Modal>
      )}

      {showOfficerForm && (
        <Modal
          title="Create Field Officer"
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
            {!isSecretary && (
              <select className="input-field" required value={officerForm.mamcosId} onChange={e => setOfficerForm({ ...officerForm, mamcosId: e.target.value })}><option value="">Select AMCOS</option>{mamcos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            )}
            <input className="input-field" placeholder="First name" required value={officerForm.firstName} onChange={e => setOfficerForm({ ...officerForm, firstName: e.target.value })} />
            <input className="input-field" placeholder="Last name" required value={officerForm.lastName} onChange={e => setOfficerForm({ ...officerForm, lastName: e.target.value })} />
            <input className="input-field" placeholder="Phone +255…" required value={officerForm.phone} onChange={e => setOfficerForm({ ...officerForm, phone: e.target.value })} />
            <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={officerForm.password} onChange={e => setOfficerForm({ ...officerForm, password: e.target.value })} />
            <input className="input-field" placeholder="Assigned area" value={officerForm.assignedArea} onChange={e => setOfficerForm({ ...officerForm, assignedArea: e.target.value })} />
          </form>
        </Modal>
      )}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading cooperatives…</div>
      ) : mamcos.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
          No cooperatives registered yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {mamcos.map((m, idx) => (
            <div key={m.id} className="glass-card animate-fade-in" style={{ padding: '24px', animationDelay: `${idx * 0.05}s` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{m.name}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{m.location || m.district || 'Location not set'}</p>
                </div>
                <span className={`badge ${m.isActive ? 'badge-green' : 'badge-gray'}`}>
                  {m.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'Farmers', value: m._count?.farmers ?? '—', icon: '👤' },
                  { label: 'Farms', value: m._count?.farms ?? '—', icon: '🌾' },
                  { label: 'Hectares', value: m.totalHectares ? `${m.totalHectares} ha` : '—', icon: '📐' },
                  { label: 'District', value: m.district || '—', icon: '📍' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--surface-tint)', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-500)', marginBottom: '2px' }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {m.chairmanName && (
                <div style={{ borderTop: '1px solid var(--hover-tint-3)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginBottom: '2px' }}>Chairman</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.chairmanName}</div>
                  {m.chairmanPhone && <div style={{ fontSize: '12px', color: 'var(--accent)' }}>{m.chairmanPhone}</div>}
                </div>
              )}
              <Link href={`/dashboard/mamcos/${m.id}`} className="btn-secondary" style={{ marginTop: '14px', fontSize: '12px', padding: '7px 10px', display: 'inline-block', textDecoration: 'none' }}>View details</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
