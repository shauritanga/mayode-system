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

const EMPTY_FORM = {
  name: '', location: '', district: 'Mbarali', totalHectares: '',
  leaderFirstName: '', leaderLastName: '', leaderPhone: '', leaderPassword: '',
};

export default function MamcosPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isSecretary = role === 'MAMCOS_SECRETARY';
  const [mamcos, setMamcos] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [showMamcosForm, setShowMamcosForm] = useState(false);
  const [form, setForm] = useState<any>({ ...EMPTY_FORM });

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

  // Creates the AMCOS, then — if leader details were filled in — assigns
  // its leader in the same flow. Leader account creation happens second so
  // a leader-creation failure (e.g. duplicate phone) doesn't lose the AMCOS
  // that was just created; it's reported without rolling anything back,
  // and a leader can still be assigned later from the AMCOS detail page.
  const createMamcos = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMessage('');
    try {
      const res = await mamcosApi.create({
        name: form.name, location: form.location, district: form.district,
        totalHectares: form.totalHectares ? Number(form.totalHectares) : undefined,
      });
      const newId = res.data?.id;

      if (form.leaderFirstName && form.leaderPhone && form.leaderPassword) {
        try {
          await authApi.createStaff({
            firstName: form.leaderFirstName, lastName: form.leaderLastName,
            phone: form.leaderPhone, password: form.leaderPassword,
            role: 'MAMCOS_SECRETARY', mamcosId: newId,
          });
          setMessage('AMCOS created and leader assigned successfully.');
        } catch (leaderErr: any) {
          setMessage(`AMCOS created, but the leader account could not be created: ${leaderErr?.response?.data?.message || 'unknown error'}. You can assign one from the AMCOS detail page.`);
        }
      } else {
        setMessage('AMCOS created successfully.');
      }

      setForm({ ...EMPTY_FORM });
      setShowMamcosForm(false);
      load();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || 'Could not create AMCOS.');
    } finally { setCreating(false); }
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
        {!isSecretary && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={() => setShowMamcosForm(true)}>+ New AMCOS</button>
          </div>
        )}
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)' }}>{message}</div>}

      {showMamcosForm && (
        <Modal
          title="Create AMCOS"
          subtitle="Optionally assign its leader in the same step — you can also do this later from the AMCOS's own page."
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

            <div style={{ marginTop: '10px', marginBottom: '2px', fontSize: '12px', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              AMCOS Leader (optional)
            </div>
            <input className="input-field" placeholder="Leader first name" value={form.leaderFirstName} onChange={e => setForm({ ...form, leaderFirstName: e.target.value })} />
            <input className="input-field" placeholder="Leader last name" value={form.leaderLastName} onChange={e => setForm({ ...form, leaderLastName: e.target.value })} />
            <input className="input-field" placeholder="Leader phone +255…" value={form.leaderPhone} onChange={e => setForm({ ...form, leaderPhone: e.target.value })} />
            <input className="input-field" type="password" minLength={6} placeholder="Leader temporary password" value={form.leaderPassword} onChange={e => setForm({ ...form, leaderPassword: e.target.value })} />
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
