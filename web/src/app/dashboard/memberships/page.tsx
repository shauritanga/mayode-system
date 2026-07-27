'use client';
import { useEffect, useState } from 'react';
import { membershipsApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Plan {
  id: string;
  name: string;
  description?: string;
  priceTzs: number;
  durationType: string;
  features: string[];
  isActive: boolean;
}
interface Membership {
  id: string;
  user?: { phone: string };
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  plan?: { name: string; priceTzs: number };
  farmingSeason?: { name: string };
  status: string;
  paymentStatus: string;
  amountTzs?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green', SPONSORED: 'badge-green', WAIVED: 'badge-green',
    PENDING: 'badge-gold', PAYMENT_PENDING: 'badge-gold',
    EXPIRED: 'badge-gray', CANCELLED: 'badge-red', SUSPENDED: 'badge-red',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace(/_/g, ' ')}</span>;
};

const emptyPlan = { name: '', description: '', priceTzs: '', durationType: 'SEASON', features: '' };

export default function MembershipsPage() {
  const [tab, setTab] = useState<'members' | 'plans'>('members');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyPlan });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      membershipsApi.getAll().then(res => setMemberships(res.data || [])),
      membershipsApi.listPlans().then(res => setPlans(res.data || [])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submitPlan = async () => {
    setError('');
    if (!form.name.trim() || !form.priceTzs) {
      setError('Name and price are required.');
      return;
    }
    setSubmitting(true);
    try {
      await membershipsApi.createPlan({
        name: form.name,
        description: form.description || undefined,
        priceTzs: Number(form.priceTzs),
        durationType: form.durationType,
        features: form.features ? form.features.split(',').map(f => f.trim()).filter(Boolean) : [],
      });
      setForm({ ...emptyPlan });
      setShowForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to create plan.');
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    setApproving(id);
    try {
      await membershipsApi.approve(id, {});
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(null);
    }
  };

  const active = memberships.filter(m => m.status === 'ACTIVE').length;
  const pending = memberships.filter(m => m.status === 'PENDING' || m.status === 'PAYMENT_PENDING').length;

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Memberships</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Premium plans and farmer membership status — gates farm analytics</p>
        </div>
        {tab === 'plans' && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New plan
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active members', value: active, color: 'var(--accent)' },
          { label: 'Awaiting payment', value: pending, color: 'var(--gold-400)' },
          { label: 'Plans', value: plans.length, color: 'var(--blue-500)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['members', 'plans'] as const).map(t => (
          <button
            key={t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '8px 16px' }}
            onClick={() => setTab(t)}
          >
            {t === 'members' ? 'Memberships' : 'Plans'}
          </button>
        ))}
      </div>

      {tab === 'plans' && showForm && (
        <Modal
          title="New membership plan"
          onClose={() => { setShowForm(false); setError(''); }}
          width="600px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submitPlan} disabled={submitting}>
                {submitting ? 'Saving…' : 'Create plan'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <Field label="Plan name *" value={form.name} onChange={v => set('name', v)} placeholder="Season Premium" />
            <Field label="Price (TZS) *" value={form.priceTzs} onChange={v => set('priceTzs', v)} placeholder="15000" />
            <div>
              <label style={labelStyle}>Duration type</label>
              <select className="input-field" value={form.durationType} onChange={e => set('durationType', e.target.value)}>
                <option value="SEASON">Season</option>
                <option value="ANNUAL">Annual</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <Field label="Description" value={form.description} onChange={v => set('description', v)} placeholder="Full analytics for one season" />
            <Field label="Features (comma-separated)" value={form.features} onChange={v => set('features', v)} placeholder="Farm analytics, Yield forecasts" />
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading…</div>
        ) : tab === 'members' ? (
          memberships.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No memberships yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farmer</th><th>Phone</th><th>Plan</th><th>Season</th><th>Period</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {memberships.map(m => (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{m.farmer ? `${m.farmer.firstName} ${m.farmer.lastName}` : '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px', fontFamily: 'monospace' }}>{m.user?.phone || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{m.plan?.name || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{m.farmingSeason?.name || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{m.startDate ? `${fmtDate(m.startDate)} → ${fmtDate(m.endDate)}` : '—'}</td>
                      <td>{statusBadge(m.status)}</td>
                      <td>
                        {(m.status === 'PENDING' || m.status === 'PAYMENT_PENDING') && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            disabled={approving === m.id}
                            onClick={() => approve(m.id)}
                          >
                            {approving === m.id ? 'Approving…' : 'Approve'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          plans.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No plans yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Plan</th><th>Price</th><th>Duration</th><th>Features</th><th>Active</th></tr>
                </thead>
                <tbody>
                  {plans.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{p.priceTzs.toLocaleString()} TZS</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{p.durationType}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{(p.features || []).join(', ') || '—'}</td>
                      <td>{p.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
