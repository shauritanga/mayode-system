'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { authApi, mamcosApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Secretary {
  firstName: string;
  lastName: string;
  stabilityBonus: number;
  user?: { phone: string; isActive: boolean };
}
interface OfficerRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  assignedArea?: string | null;
  user?: { phone: string; isActive: boolean };
}
interface FarmerRow { id: string; controlNumber: string; firstName: string; lastName: string; creditScore: number }
interface FarmRow { id: string; farmCode: string; socialHectares: number; grade?: string; isVerified: boolean }
interface ProductionSummary {
  totalRegisteredHectares: number;
  totalActualYieldKg: number;
  totalEstimatedYieldKg: number;
  totalRiceAggregatedKg: number;
}
interface MamcosDetail {
  id: string;
  name: string;
  district?: string;
  location?: string;
  chairmanName?: string;
  chairmanPhone?: string;
  totalHectares?: number;
  isActive: boolean;
  secretary?: Secretary | null;
  productionSummary?: ProductionSummary;
  fieldOfficers: OfficerRow[];
  farmers: FarmerRow[];
  farms: FarmRow[];
}

const EMPTY_LEADER_FORM = { firstName: '', lastName: '', phone: '', password: '' };
const EMPTY_OFFICER_FORM = { firstName: '', lastName: '', phone: '', password: '', assignedArea: '' };

export default function MamcosDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [mamcos, setMamcos] = useState<MamcosDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showLeaderForm, setShowLeaderForm] = useState(false);
  const [leaderForm, setLeaderForm] = useState<any>({ ...EMPTY_LEADER_FORM });
  const [showOfficerForm, setShowOfficerForm] = useState(false);
  const [officerForm, setOfficerForm] = useState<any>({ ...EMPTY_OFFICER_FORM });
  const [staffMessage, setStaffMessage] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);

  const load = () => {
    setLoading(true);
    mamcosApi.getOne(id)
      .then(res => setMamcos(res.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const assignLeader = async (e: React.FormEvent) => {
    e.preventDefault(); setStaffSaving(true); setStaffMessage('');
    try {
      await authApi.createStaff({ ...leaderForm, role: 'MAMCOS_SECRETARY', mamcosId: id });
      setStaffMessage('AMCOS Leader assigned successfully.');
      setLeaderForm({ ...EMPTY_LEADER_FORM });
      setShowLeaderForm(false);
      load();
    } catch (e: any) {
      setStaffMessage(e?.response?.data?.message || 'Could not assign AMCOS Leader.');
    } finally { setStaffSaving(false); }
  };

  const addOfficer = async (e: React.FormEvent) => {
    e.preventDefault(); setStaffSaving(true); setStaffMessage('');
    try {
      await authApi.createStaff({ ...officerForm, role: 'FIELD_OFFICER', mamcosId: id });
      setStaffMessage('Field Officer added successfully.');
      setOfficerForm({ ...EMPTY_OFFICER_FORM });
      setShowOfficerForm(false);
      load();
    } catch (e: any) {
      setStaffMessage(e?.response?.data?.message || 'Could not add Field Officer.');
    } finally { setStaffSaving(false); }
  };

  const openEdit = () => {
    if (!mamcos) return;
    setForm({
      name: mamcos.name,
      location: mamcos.location || '',
      district: mamcos.district || '',
      totalHectares: mamcos.totalHectares ?? '',
      chairmanName: mamcos.chairmanName || '',
      chairmanPhone: mamcos.chairmanPhone || '',
      isActive: mamcos.isActive,
    });
    setError('');
    setShowEditForm(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await mamcosApi.update(id, { ...form, totalHectares: form.totalHectares !== '' ? Number(form.totalHectares) : undefined });
      setShowEditForm(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not update AMCOS.');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading AMCOS…</div>;
  }
  if (notFound || !mamcos) {
    return (
      <div>
        <Breadcrumb name="Not found" />
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
          AMCOS not found.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb name={mamcos.name} />

      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{mamcos.name}</h1>
            <span className={`badge ${mamcos.isActive ? 'badge-green' : 'badge-gray'}`}>{mamcos.isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>{mamcos.location || mamcos.district || 'Location not set'}</p>
        </div>
        <button className="btn-primary" onClick={openEdit}>Edit AMCOS</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Farmers', value: mamcos.farmers.length, color: 'var(--accent)' },
          { label: 'Farms', value: mamcos.farms.length, color: 'var(--blue-500)' },
          { label: 'Registered farm area', value: mamcos.productionSummary ? `${mamcos.productionSummary.totalRegisteredHectares.toLocaleString()} ha` : '—', color: 'var(--gold-400)' },
          {
            label: 'Total yield',
            value: mamcos.productionSummary
              ? `${(mamcos.productionSummary.totalActualYieldKg || mamcos.productionSummary.totalEstimatedYieldKg).toLocaleString()} kg${mamcos.productionSummary.totalActualYieldKg ? '' : ' (est.)'}`
              : '—',
            color: 'var(--green-400)',
          },
          { label: 'Rice aggregated to date', value: mamcos.productionSummary ? `${mamcos.productionSummary.totalRiceAggregatedKg.toLocaleString()} kg` : '—', color: 'var(--purple-500)' },
          { label: 'District', value: mamcos.district || '—', color: 'var(--neutral-400)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '18px' }}>
          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>AMCOS Leader</strong>
          {mamcos.secretary ? (
            <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <div style={{ fontWeight: 600 }}>{mamcos.secretary.firstName} {mamcos.secretary.lastName}</div>
              <div style={{ color: 'var(--neutral-400)', fontFamily: 'monospace', marginTop: '2px' }}>{mamcos.secretary.user?.phone || '—'}</div>
              <div style={{ marginTop: '6px' }}>
                <span className={`badge ${mamcos.secretary.user?.isActive ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '11px' }}>
                  {mamcos.secretary.user?.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ) : (
            <>
              <p style={{ marginTop: '10px', marginBottom: '10px', fontSize: '13px', color: 'var(--neutral-500)' }}>No leader assigned yet.</p>
              <button className="btn-secondary" style={{ fontSize: '12px', padding: '7px 10px' }} onClick={() => setShowLeaderForm(true)}>+ Assign Leader</button>
            </>
          )}
        </div>

        <div className="glass-card" style={{ padding: '18px' }}>
          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Chairman</strong>
          {mamcos.chairmanName ? (
            <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <div style={{ fontWeight: 600 }}>{mamcos.chairmanName}</div>
              {mamcos.chairmanPhone && <div style={{ color: 'var(--accent)', marginTop: '2px' }}>{mamcos.chairmanPhone}</div>}
            </div>
          ) : (
            <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--neutral-500)' }}>Not recorded.</p>
          )}
        </div>
      </div>

      {staffMessage && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)' }}>{staffMessage}</div>}

      <div className="glass-card" style={{ overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Field Officers</span>
          <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 10px' }} onClick={() => setShowOfficerForm(true)}>+ Add Field Officer</button>
        </div>
        {mamcos.fieldOfficers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No field officers assigned to this AMCOS yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Employee code</th><th>Name</th><th>Phone</th><th>Assigned area</th><th>Status</th></tr></thead>
              <tbody>
                {mamcos.fieldOfficers.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neutral-400)' }}>{o.employeeCode}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{o.firstName} {o.lastName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neutral-400)' }}>{o.user?.phone || '—'}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{o.assignedArea || '—'}</td>
                    <td><span className={`badge ${o.user?.isActive ? 'badge-green' : 'badge-gray'}`}>{o.user?.isActive ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Farmers</div>
        {mamcos.farmers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No farmers in this AMCOS yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Control No.</th><th>Name</th><th>Credit score</th></tr></thead>
              <tbody>
                {mamcos.farmers.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neutral-400)' }}>{f.controlNumber}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{f.firstName} {f.lastName}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{f.creditScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Farms</div>
        {mamcos.farms.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No farms registered under this AMCOS yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Farm code</th><th>Hectares</th><th>Grade</th><th>Verified</th></tr></thead>
              <tbody>
                {mamcos.farms.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{f.farmCode}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{f.socialHectares} ha</td>
                    <td style={{ fontSize: '13px', color: 'var(--neutral-400)' }}>{f.grade || '—'}</td>
                    <td>{f.isVerified ? <span className="badge badge-green">Verified</span> : <span className="badge badge-gray">Pending</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditForm && form && (
        <Modal
          title="Edit AMCOS"
          onClose={() => setShowEditForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowEditForm(false)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </>
          }
        >
          <form onSubmit={saveEdit} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="AMCOS name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="input-field" placeholder="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            <input className="input-field" placeholder="District" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} />
            <input className="input-field" type="number" placeholder="Hectares" value={form.totalHectares} onChange={e => setForm({ ...form, totalHectares: e.target.value })} />
            <input className="input-field" placeholder="Chairman name" value={form.chairmanName} onChange={e => setForm({ ...form, chairmanName: e.target.value })} />
            <input className="input-field" placeholder="Chairman phone" value={form.chairmanPhone} onChange={e => setForm({ ...form, chairmanPhone: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
            {error && <div style={{ color: 'var(--red-400)', fontSize: '13px' }}>{error}</div>}
          </form>
        </Modal>
      )}

      {showLeaderForm && (
        <Modal
          title="Assign AMCOS Leader"
          onClose={() => setShowLeaderForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowLeaderForm(false)} disabled={staffSaving}>Cancel</button>
              <button className="btn-primary" onClick={assignLeader} disabled={staffSaving}>{staffSaving ? 'Saving…' : 'Create leader account'}</button>
            </>
          }
        >
          <form onSubmit={assignLeader} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="First name" required value={leaderForm.firstName} onChange={e => setLeaderForm({ ...leaderForm, firstName: e.target.value })} />
            <input className="input-field" placeholder="Last name" required value={leaderForm.lastName} onChange={e => setLeaderForm({ ...leaderForm, lastName: e.target.value })} />
            <input className="input-field" placeholder="Phone +255…" required value={leaderForm.phone} onChange={e => setLeaderForm({ ...leaderForm, phone: e.target.value })} />
            <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={leaderForm.password} onChange={e => setLeaderForm({ ...leaderForm, password: e.target.value })} />
          </form>
        </Modal>
      )}

      {showOfficerForm && (
        <Modal
          title="Add Field Officer"
          onClose={() => setShowOfficerForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowOfficerForm(false)} disabled={staffSaving}>Cancel</button>
              <button className="btn-primary" onClick={addOfficer} disabled={staffSaving}>{staffSaving ? 'Saving…' : 'Create staff account'}</button>
            </>
          }
        >
          <form onSubmit={addOfficer} style={{ display: 'grid', gap: '9px' }}>
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

function Breadcrumb({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--neutral-500)', marginBottom: '16px' }}>
      <Link href="/dashboard/mamcos" style={{ color: 'var(--accent)', textDecoration: 'none' }}>AMCOS Cooperatives</Link>
      <span>/</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{name}</span>
    </div>
  );
}
