'use client';
import { useEffect, useState } from 'react';
import { cropCyclesApi } from '@/lib/api';

interface CropCycle {
  id: string;
  season: string;
  riceVariety?: string;
  status: string;
  estimatedYieldKg?: number;
  actualYieldKg?: number;
  plantingDate?: string;
  harvestDate?: string;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  farm?: { farmCode: string };
}

const cycleStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    PLANNED: 'badge-gray',
    ACTIVE: 'badge-green',
    HARVESTED: 'badge-gold',
    COMPLETED: 'badge-blue',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
};

export default function CropCyclesPage() {
  const [cycles, setCycles] = useState<CropCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    cropCyclesApi.getAll()
      .then(res => setCycles(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = cycles.filter(c =>
    `${c.season} ${c.farmer?.firstName} ${c.farmer?.lastName} ${c.riceVariety || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, #059669, #10B981)', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: '#F9FAFB' }}>Crop Cycles</h1>
          </div>
          <p style={{ fontSize: '13px', color: '#6B7280', marginLeft: '14px' }}>Agronomic seasonal cycles per farm & farmer</p>
        </div>
        <input
          id="crop-cycles-search"
          type="search"
          placeholder="Search season, farmer, or variety…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ width: '280px' }}
        />
      </div>

      {/* Status Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {(['PLANNED', 'ACTIVE', 'HARVESTED', 'COMPLETED'] as const).map((s) => {
          const count = cycles.filter(c => c.status === s).length;
          const colors: Record<string, string> = { PLANNED: '#6B7280', ACTIVE: '#10B981', HARVESTED: '#F59E0B', COMPLETED: '#3B82F6' };
          return (
            <div key={s} className="stat-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: colors[s], fontFamily: 'Outfit, sans-serif' }}>{count}</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{s}</div>
            </div>
          );
        })}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>Loading crop cycles…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>No crop cycles found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Farmer</th>
                  <th>Farm</th>
                  <th>Rice Variety</th>
                  <th>Est. Yield</th>
                  <th>Actual Yield</th>
                  <th>Planting Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, color: '#F9FAFB', fontSize: '13px' }}>{c.season}</td>
                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB' }}>
                        {c.farmer ? `${c.farmer.firstName} ${c.farmer.lastName}` : '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{c.farmer?.controlNumber}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#10B981' }}>{c.farm?.farmCode || '—'}</td>
                    <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{c.riceVariety || '—'}</td>
                    <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{c.estimatedYieldKg ? `${c.estimatedYieldKg} kg` : '—'}</td>
                    <td style={{ fontWeight: c.actualYieldKg ? 700 : 400, color: c.actualYieldKg ? '#10B981' : '#4B5563', fontSize: '13px' }}>
                      {c.actualYieldKg ? `${c.actualYieldKg} kg` : '—'}
                    </td>
                    <td style={{ color: '#6B7280', fontSize: '12px' }}>
                      {c.plantingDate ? new Date(c.plantingDate).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td>{cycleStatusBadge(c.status)}</td>
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
