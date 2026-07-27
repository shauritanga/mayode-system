'use client';
import { useEffect, useState } from 'react';
import { registryApi, mamcosApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface RegistryRecord {
  id: string;
  ownerName: string;
  ownerPhone: string;
  name?: string;
  plotNumber?: string;
  block?: string;
  farmSizeHectares?: number;
  status: string;
  mamcos?: { name: string };
  createdAt: string;
}
interface Mamcos { id: string; name: string }

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    OWNER_CONFIRMATION_PENDING: 'badge-gold',
    OWNER_CONFIRMED: 'badge-blue',
    CLAIMED: 'badge-green',
    DISPUTED: 'badge-red',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace(/_/g, ' ')}</span>;
};

const emptyForm = {
  ownerName: '', ownerPhone: '', sourceMamcosId: '', name: '',
  plotNumber: '', block: '', canal: '', scheme: '', section: '',
  village: '', ward: '', district: 'Mbarali', region: 'Mbeya', farmSizeHectares: '',
};

export default function FarmRegistryPage() {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [mamcos, setMamcos] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    registryApi.list()
      .then(res => setRecords(res.data || []))
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
    if (!form.ownerName.trim() || !form.ownerPhone.trim()) {
      setError('Owner name and phone are required.');
      return;
    }
    setSubmitting(true);
    try {
      await registryApi.preRegister({
        ...form,
        sourceMamcosId: form.sourceMamcosId || undefined,
        farmSizeHectares: form.farmSizeHectares ? Number(form.farmSizeHectares) : undefined,
      });
      setForm({ ...emptyForm });
      setShowForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to pre-register farm.');
    } finally {
      setSubmitting(false);
    }
  };

  const pending = records.filter(r => r.status === 'OWNER_CONFIRMATION_PENDING').length;
  const claimed = records.filter(r => r.status === 'CLAIMED').length;

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farm Registry</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Pre-register farms &amp; owners — the AMCOS-first registry</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Pre-register farm
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Pre-registered', value: records.length, color: 'var(--accent)' },
          { label: 'Awaiting owner', value: pending, color: 'var(--gold-400)' },
          { label: 'Claimed', value: claimed, color: 'var(--green-400)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pre-registration form */}
      {showForm && (
        <Modal
          title="Pre-register a farm under a known owner"
          subtitle="The owner is notified by SMS/app to confirm and complete their profile"
          onClose={() => { setShowForm(false); setError(''); }}
          width="720px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Pre-register & notify owner'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <Field label="Owner name *" value={form.ownerName} onChange={v => set('ownerName', v)} />
            <Field label="Owner phone *" value={form.ownerPhone} onChange={v => set('ownerPhone', v)} placeholder="+255712345678" />
            <div>
              <label style={labelStyle}>Responsible AMCOS</label>
              <select className="input-field" value={form.sourceMamcosId} onChange={e => set('sourceMamcosId', e.target.value)}>
                <option value="">— select —</option>
                {mamcos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <Field label="Plot number" value={form.plotNumber} onChange={v => set('plotNumber', v)} placeholder="02" />
            <Field label="Block" value={form.block} onChange={v => set('block', v)} placeholder="5" />
            <Field label="Canal" value={form.canal} onChange={v => set('canal', v)} />
            <Field label="Scheme" value={form.scheme} onChange={v => set('scheme', v)} />
            <Field label="Section" value={form.section} onChange={v => set('section', v)} placeholder="South-West" />
            <Field label="Village" value={form.village} onChange={v => set('village', v)} />
            <Field label="District" value={form.district} onChange={v => set('district', v)} />
            <Field label="Region" value={form.region} onChange={v => set('region', v)} />
            <Field label="Size (hectares)" value={form.farmSizeHectares} onChange={v => set('farmSizeHectares', v)} placeholder="2.5" />
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {/* Registry table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading registry…</div>
        ) : records.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No pre-registered farms yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Farm</th><th>Owner</th><th>Phone</th><th>AMCOS</th><th>Size</th><th>Status</th></tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{r.name || '—'}</td>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{r.ownerName}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px', fontFamily: 'monospace' }}>{r.ownerPhone}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{r.mamcos?.name || '—'}</td>
                    <td style={{ color: 'var(--text-primary)' }}>{r.farmSizeHectares ? `${r.farmSizeHectares} ha` : '—'}</td>
                    <td>{statusBadge(r.status)}</td>
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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input-field" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
