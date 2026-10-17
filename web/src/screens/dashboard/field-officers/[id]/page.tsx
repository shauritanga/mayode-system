'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fieldOfficersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import Modal from '@/components/Modal';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { ago, officerName, syncTone } from '@/lib/field-officers';
import { fmtDate } from '@/lib/crop-stages';

const h3: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };
const toneColor = { green: 'var(--green-500)', gold: 'var(--gold-400)', red: 'var(--red-500)' } as const;

function Attr({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value || value === 0 ? value : '—'}</div>
    </div>
  );
}

export default function FieldOfficerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MAMCOS_SECRETARY';

  const [officer, setOfficer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [pickedFarmers, setPickedFarmers] = useState<string[]>([]);
  const [pickedFarms, setPickedFarms] = useState<string[]>([]);

  const load = () => {
    fieldOfficersApi.getOne(id)
      .then((r) => { setOfficer(r.data); setError(''); })
      .catch((e) => setError(e?.response?.data?.message || 'Could not load this officer.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const release = async () => {
    if (!pickedFarmers.length && !pickedFarms.length) return;
    if (!confirm(`Release ${pickedFarmers.length} farmer(s) and ${pickedFarms.length} farm(s) from this officer?`)) return;
    try {
      await fieldOfficersApi.assign(id, { farmerIds: pickedFarmers, farmIds: pickedFarms, unassign: true });
      setPickedFarmers([]); setPickedFarms([]);
      setMessage('Released from this officer.');
      load();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || 'Could not release the selection.');
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>Loading field officer…</div>;
  if (error || !officer) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>{error || 'Field officer not found.'}</div>;

  const resend = async () => {
    if (!confirm(`Send ${officerName(officer)} a new temporary password by SMS? Their current password stops working and they are signed out.`)) return;
    try {
      const res = await fieldOfficersApi.resendCredentials(id);
      const data = res.data as { credentialsSms: string; temporaryPassword?: string };
      setMessage(data.credentialsSms === 'sent'
        ? 'New sign-in details were sent by SMS.'
        : `The SMS could not be sent. Give the officer this temporary password (shown once): ${data.temporaryPassword}`);
    } catch (err) {
      setMessage(`Could not reissue credentials: ${apiErrorMessage(err, 'try again')}`);
    }
  };

  const tone = syncTone(officer.lastSyncAt);
  const toggle = (list: string[], setList: (v: string[]) => void, key: string) =>
    setList(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

  return (
    <div>
      <button className="btn-secondary" style={{ marginBottom: 16, fontSize: 12 }} onClick={() => router.back()}>← Back</button>

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 4, height: 26, background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: 9999 }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{officerName(officer)}</h1>
            <span className={`badge ${officer.isActive ? 'badge-green' : 'badge-gold'}`}>{officer.isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginLeft: 14 }}>{officer.employeeCode ?? 'No officer ID'}{officer.cooperative ? ` · ${officer.cooperative}` : ''}</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setEditing(true)}>Edit profile</button>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={resend}>Resend credentials</button>
            <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setAssigning(true)}>+ Assign farmers / farms</button>
          </div>
        )}
      </div>

      {message && <div className="alert-box alert-success" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={h3}>Profile</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          <Attr label="Officer ID" value={officer.employeeCode} />
          <Attr label="Phone" value={officer.phone} />
          <Attr label="Region" value={officer.region} />
          <Attr label="District" value={officer.district} />
          <Attr label="Assigned area" value={officer.assignedArea} />
          <Attr label="Last visit" value={officer.lastVisitAt ? fmtDate(officer.lastVisitAt) : null} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginBottom: 2 }}>Last mobile-app sync</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: toneColor[tone], marginRight: 6 }} aria-hidden />
              {ago(officer.lastSyncAt) ?? 'Never synced'}
            </div>
          </div>
          <Attr label="Last login" value={ago(officer.lastLoginAt) ?? 'Never'} />
        </div>
      </div>

      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Farmers assigned" value={officer.farmersAssigned} hint={`${officer.farmersRegistered} registered`} tone="blue" />
        <MetricTile label="Farms assigned" value={officer.farmsAssigned} hint={`${officer.farmsMapped} mapped`} tone="gold" />
        <MetricTile label="Visits completed" value={officer.visitsCompleted} hint={`${officer.cropRecordsUpdated} crop records updated`} tone="purple" />
        <MetricTile label="Data completeness" value={officer.dataCompleteness == null ? '—' : `${officer.dataCompleteness}%`} hint="Records this officer registered" tone="green" />
        <MetricTile label="Pending tasks" value={officer.pendingTasks} hint={`${officer.pendingBreakdown.farmerVerifications} farmer · ${officer.pendingBreakdown.farmVerifications} farm · ${officer.pendingBreakdown.overdueVisits} overdue visits`} tone="gold" />
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ ...h3, margin: 0 }}>Assigned farmers ({officer.farmers.length}) and farms ({officer.farms.length})</h3>
          {canManage && (pickedFarmers.length > 0 || pickedFarms.length > 0) && (
            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px', color: 'var(--red-500)' }} onClick={release}>Release selected ({pickedFarmers.length + pickedFarms.length})</button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            {officer.farmers.length === 0 ? <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>No farmers assigned.</p> : (
              <table className="data-table">
                <thead><tr>{canManage && <th />}<th>Farmer</th><th>Village</th><th>Status</th></tr></thead>
                <tbody>
                  {officer.farmers.map((f: any) => (
                    <tr key={f.id}>
                      {canManage && <td><input type="checkbox" aria-label={`Select ${f.firstName} ${f.lastName}`} checked={pickedFarmers.includes(f.id)} onChange={() => toggle(pickedFarmers, setPickedFarmers, f.id)} /></td>}
                      <td><Link href={`/dashboard/farmers/${f.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{f.firstName} {f.lastName}</Link><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{f.controlNumber}</div></td>
                      <td style={{ fontSize: 12 }}>{f.village ?? '—'}</td>
                      <td style={{ fontSize: 12 }}>{String(f.verificationStatus).toLowerCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            {officer.farms.length === 0 ? <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>No farms assigned.</p> : (
              <table className="data-table">
                <thead><tr>{canManage && <th />}<th>Farm</th><th>Village</th><th>Size</th><th>Verified</th></tr></thead>
                <tbody>
                  {officer.farms.map((f: any) => (
                    <tr key={f.id}>
                      {canManage && <td><input type="checkbox" aria-label={`Select farm ${f.farmCode}`} checked={pickedFarms.includes(f.id)} onChange={() => toggle(pickedFarms, setPickedFarms, f.id)} /></td>}
                      <td><Link href={`/dashboard/farms/${f.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{f.farmCode}</Link></td>
                      <td style={{ fontSize: 12 }}>{f.village ?? '—'}</td>
                      <td style={{ fontSize: 12 }}>{f.socialHectares} ha</td>
                      <td style={{ fontSize: 12 }}>{f.isVerified ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        <h3 style={h3}>Recent field visits</h3>
        {officer.visits.length === 0 ? <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>No visits recorded yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Farmer</th><th>Farm</th><th>Purpose</th><th>Next visit</th><th>Notes</th></tr></thead>
              <tbody>
                {officer.visits.map((v: any) => (
                  <tr key={v.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(v.visitedAt)}</td>
                    <td style={{ fontSize: 12 }}>{v.farmer.firstName} {v.farmer.lastName}</td>
                    <td style={{ fontSize: 12 }}>{v.farm?.farmCode ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{String(v.purpose).replace(/_/g, ' ').toLowerCase()}</td>
                    <td style={{ fontSize: 12 }}>{v.nextVisitDate ? fmtDate(v.nextVisitDate) : '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 260, color: 'var(--neutral-400)' }}>{v.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EditProfileModal officer={officer} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setMessage('Profile updated.'); load(); }} />}
      {assigning && <AssignModal officerId={id} onClose={() => setAssigning(false)} onSaved={(n) => { setAssigning(false); setMessage(`Assigned ${n.farmers} farmer(s) and ${n.farms} farm(s).`); load(); }} />}
    </div>
  );
}

function EditProfileModal({ officer, onClose, onSaved }: { officer: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ firstName: officer.firstName, lastName: officer.lastName, region: officer.region ?? '', district: officer.district ?? '', assignedArea: officer.assignedArea ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof v, value: string) => setV((p) => ({ ...p, [k]: value }));
  const save = async () => {
    if (!v.firstName.trim() || !v.lastName.trim()) return setError('First and last name are required.');
    setSaving(true);
    try {
      await fieldOfficersApi.update(officer.id, { firstName: v.firstName.trim(), lastName: v.lastName.trim(), region: v.region.trim() || undefined, district: v.district.trim() || undefined, assignedArea: v.assignedArea.trim() || undefined });
      onSaved();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Could not save.');
      setSaving(false);
    }
  };
  const field = (label: string, key: keyof typeof v, wide?: boolean) => (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}><label style={labelStyle}>{label}</label><input className="input-field" value={v[key]} onChange={(e) => set(key, e.target.value)} /></div>
  );
  return (
    <Modal title="Edit field officer" subtitle="Phone and account status are managed under User Accounts." onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></>}>
      {error && <div className="alert-box alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {field('First name', 'firstName')}{field('Last name', 'lastName')}
        {field('Assigned region', 'region')}{field('Assigned district', 'district')}
        {field('Assigned area (wards, villages)', 'assignedArea', true)}
      </div>
    </Modal>
  );
}

function AssignModal({ officerId, onClose, onSaved }: { officerId: string; onClose: () => void; onSaved: (n: { farmers: number; farms: number }) => void }) {
  const [data, setData] = useState<{ farmers: any[]; farms: any[] } | null>(null);
  const [search, setSearch] = useState('');
  const [farmerIds, setFarmerIds] = useState<string[]>([]);
  const [farmIds, setFarmIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fieldOfficersApi.unassigned().then((r) => setData(r.data)).catch(() => setError('Could not load unassigned farmers and farms.'));
  }, []);

  const q = search.trim().toLowerCase();
  const farmers = useMemo(() => (data?.farmers ?? []).filter((f) => !q || `${f.firstName} ${f.lastName} ${f.controlNumber} ${f.village ?? ''}`.toLowerCase().includes(q)), [data, q]);
  const farms = useMemo(() => (data?.farms ?? []).filter((f) => !q || `${f.farmCode} ${f.name ?? ''} ${f.village ?? ''}`.toLowerCase().includes(q)), [data, q]);
  const flip = (list: string[], set: (v: string[]) => void, key: string) => set(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fieldOfficersApi.assign(officerId, { farmerIds, farmIds });
      onSaved(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not assign.');
      setSaving(false);
    }
  };

  return (
    <Modal title="Assign farmers and farms" subtitle="Farmers and farms that don't have a field officer yet." width="720px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving || (!farmerIds.length && !farmIds.length)}>{saving ? 'Assigning…' : `Assign ${farmerIds.length} farmer(s), ${farmIds.length} farm(s)`}</button></>}>
      {error && <div className="alert-box alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <input className="input-field" type="search" placeholder="Search name, control number, farm code or village…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
      {!data ? <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={labelStyle}>Farmers ({farmers.length}) <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '1px 8px', marginLeft: 6 }} onClick={() => setFarmerIds(farmers.map((f) => f.id))}>Select all</button></div>
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
              {farmers.length === 0 ? <p style={{ padding: 12, fontSize: 12, color: 'var(--neutral-500)' }}>None without an officer.</p> : farmers.map((f) => (
                <label key={f.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={farmerIds.includes(f.id)} onChange={() => flip(farmerIds, setFarmerIds, f.id)} />
                  <span>{f.firstName} {f.lastName} <span style={{ color: 'var(--neutral-500)' }}>· {f.controlNumber}{f.village ? ` · ${f.village}` : ''}</span></span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Farms ({farms.length}) <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '1px 8px', marginLeft: 6 }} onClick={() => setFarmIds(farms.map((f) => f.id))}>Select all</button></div>
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
              {farms.length === 0 ? <p style={{ padding: 12, fontSize: 12, color: 'var(--neutral-500)' }}>None without an officer.</p> : farms.map((f) => (
                <label key={f.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={farmIds.includes(f.id)} onChange={() => flip(farmIds, setFarmIds, f.id)} />
                  <span>{f.farmCode} <span style={{ color: 'var(--neutral-500)' }}>{f.name ? `· ${f.name}` : ''}{f.village ? ` · ${f.village}` : ''}</span></span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
