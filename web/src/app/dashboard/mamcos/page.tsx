'use client';
import { useEffect, useState } from 'react';
import { mamcosApi } from '@/lib/api';

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

export default function MamcosPage() {
  const [mamcos, setMamcos] = useState<Mamcos[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mamcosApi.getAll()
      .then(res => setMamcos(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, #F59E0B, #FCD34D)', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: '#F9FAFB' }}>AMCOS Cooperatives</h1>
        </div>
        <p style={{ fontSize: '13px', color: '#6B7280', marginLeft: '14px' }}>Registered cooperative management schemes</p>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>Loading cooperatives…</div>
      ) : mamcos.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
          No cooperatives registered yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {mamcos.map((m, idx) => (
            <div key={m.id} className="glass-card animate-fade-in" style={{ padding: '24px', animationDelay: `${idx * 0.05}s` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#F9FAFB', marginBottom: '4px' }}>{m.name}</h3>
                  <p style={{ fontSize: '12px', color: '#6B7280' }}>{m.location || m.district || 'Location not set'}</p>
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
                  <div key={item.label} style={{ background: 'rgba(31, 41, 55, 0.5)', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {m.chairmanName && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '2px' }}>Chairman</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB' }}>{m.chairmanName}</div>
                  {m.chairmanPhone && <div style={{ fontSize: '12px', color: '#10B981' }}>{m.chairmanPhone}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
