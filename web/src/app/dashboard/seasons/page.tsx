'use client';
import { useEffect, useState } from 'react';
import { farmingSeasonsApi, mamcosApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Season {
  id: string;
  name: string;
  region?: string;
  crop?: string;
  startDate: string;
  endDate: string;
  status: string;
  mamcos?: { name: string };
}
interface Mamcos { id: string; name: string }

const STATUSES = ['DRAFT', 'REGISTRATION_OPEN', 'VERIFICATION_IN_PROGRESS', 'ACTIVE', 'HARVESTING', 'COMPLETED', 'ARCHIVED'];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    DRAFT: 'badge-gray',
    REGISTRATION_OPEN: 'badge-blue',
    VERIFICATION_IN_PROGRESS: 'badge-gold',
    ACTIVE: 'badge-green',
    HARVESTING: 'badge-green',
    COMPLETED: 'badge-blue',
    ARCHIVED: 'badge-gray',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace(/_/g, ' ')}</span>;
};

const emptyForm = {
  name: '', mamcosId: '', region: '', crop: '', startDate: '', endDate: '',
  registrationOpenDate: '', registrationCloseDate: '', verificationDeadline: '', status: 'DRAFT',
};

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [mamcos, setMamcos] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    farmingSeasonsApi.getAll()
      .then(res => setSeasons(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    mamcosApi.getAll().then(res => setMamcos(res.data || [])).catch(console.error);
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      setError('Name, start date and end date are required.');
      return;
    }
    setSubmitting(true);
    try {
      await farmingSeasonsApi.create({
        ...form,
        mamcosId: form.mamcosId || undefined,
        region: form.region || undefined,
        crop: form.crop || undefined,
        registrationOpenDate: form.registrationOpenDate || undefined,
        registrationCloseDate: form.registrationCloseDate || undefined,
        verificationDeadline: form.verificationDeadline || undefined,
      });
      setForm({ ...emptyForm });
      setShowForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to create season.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await farmingSeasonsApi.update(id, { status });
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const active = seasons.filter(s => s.status === 'ACTIVE' || s.status === 'REGISTRATION_OPEN').length;

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farming Seasons</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Configure farming-season periods — memberships and lease periods follow these</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New season
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total seasons', value: seasons.length, color: 'var(--accent)' },
          { label: 'Open / active', value: active, color: 'var(--blue-500)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal
          title="New farming season"
          subtitle="Memberships and lease periods follow this season's dates"
          onClose={() => { setShowForm(false); setError(''); }}
          width="600px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Create season'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <Field label="Season name *" value={form.name} onChange={v => set('name', v)} placeholder="2026/2027 Masika" />
            <div>
              <label style={labelStyle}>AMCOS</label>
              <select className="input-field" value={form.mamcosId} onChange={e => set('mamcosId', e.target.value)}>
                <option value="">— all / not scoped —</option>
                {mamcos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <Field label="Region" value={form.region} onChange={v => set('region', v)} placeholder="Mbeya" />
            <Field label="Crop" value={form.crop} onChange={v => set('crop', v)} placeholder="Rice" />
            <Field label="Start date *" value={form.startDate} onChange={v => set('startDate', v)} type="date" />
            <Field label="End date *" value={form.endDate} onChange={v => set('endDate', v)} type="date" />
            <Field label="Registration opens" value={form.registrationOpenDate} onChange={v => set('registrationOpenDate', v)} type="date" />
            <Field label="Registration closes" value={form.registrationCloseDate} onChange={v => set('registrationCloseDate', v)} type="date" />
            <Field label="Verification deadline" value={form.verificationDeadline} onChange={v => set('verificationDeadline', v)} type="date" />
            <div>
              <label style={labelStyle}>Status</label>
              <select className="input-field" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading seasons…</div>
        ) : seasons.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No farming seasons configured yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Season</th><th>AMCOS</th><th>Region / Crop</th><th>Period</th><th>Status</th><th>Change status</th></tr>
              </thead>
              <tbody>
                {seasons.map(s => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{s.mamcos?.name || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{[s.region, s.crop].filter(Boolean).join(' · ') || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td>
                      <select
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                        value={s.status}
                        onChange={e => updateStatus(s.id, e.target.value)}
                      >
                        {STATUSES.map(st => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input-field" type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
