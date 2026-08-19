'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  farmer?: { id?: string; firstName: string; lastName: string; controlNumber: string };
  farm?: { id?: string; farmCode: string };
}

type StatusFilter = 'all' | 'PLANNED' | 'ACTIVE' | 'HARVESTED' | 'COMPLETED';

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    cropCyclesApi.getAll()
      .then(res => setCycles(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const seasons = useMemo(
    () => Array.from(new Set(cycles.map((c) => c.season).filter(Boolean))).sort(),
    [cycles],
  );
  const [seasonFilter, setSeasonFilter] = useState<string>('all');

  const filtered = cycles.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      `${c.season} ${c.farmer?.firstName} ${c.farmer?.lastName} ${c.farmer?.controlNumber || ''} ${c.farm?.farmCode || ''} ${c.riceVariety || ''}`
        .toLowerCase()
        .includes(q);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesSeason = seasonFilter === 'all' || c.season === seasonFilter;
    return matchesSearch && matchesStatus && matchesSeason;
  });

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--green-600), var(--accent))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Crop Cycles</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Agronomic seasonal cycles per farm & farmer</p>
        </div>
        <input
          id="crop-cycles-search"
          type="search"
          placeholder="Search season, farmer, farm, or variety…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ width: '280px' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {(['PLANNED', 'ACTIVE', 'HARVESTED', 'COMPLETED'] as const).map((s) => {
          const count = cycles.filter(c => c.status === s).length;
          const colors: Record<string, string> = { PLANNED: 'var(--neutral-500)', ACTIVE: 'var(--accent)', HARVESTED: 'var(--gold-400)', COMPLETED: 'var(--blue-500)' };
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              className="stat-card"
              onClick={() => setStatusFilter(active ? 'all' : s)}
              style={{
                padding: '16px',
                textAlign: 'left',
                cursor: 'pointer',
                border: active ? '2px solid var(--accent)' : undefined,
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, color: colors[s], fontFamily: 'Outfit, sans-serif' }}>{count}</div>
              <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--neutral-500)', marginRight: '4px' }}>Season</span>
        <button
          type="button"
          className={`badge ${seasonFilter === 'all' ? 'badge-green' : 'badge-gray'}`}
          onClick={() => setSeasonFilter('all')}
          style={{ cursor: 'pointer', border: 'none' }}
        >
          All
        </button>
        {seasons.map((season) => (
          <button
            key={season}
            type="button"
            className={`badge ${seasonFilter === season ? 'badge-green' : 'badge-gray'}`}
            onClick={() => setSeasonFilter(season)}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            {season}
          </button>
        ))}
        {(statusFilter !== 'all' || seasonFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setSeasonFilter('all'); }}
            style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading crop cycles…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No crop cycles found.</div>
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
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{c.season}</td>
                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.farmer ? `${c.farmer.firstName} ${c.farmer.lastName}` : '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{c.farmer?.controlNumber || '—'}</div>
                    </td>
                    <td>
                      {c.farm?.id ? (
                        <Link
                          href={`/dashboard/farms/${c.farm.id}`}
                          style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {c.farm.farmCode}
                        </Link>
                      ) : (
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neutral-400)' }}>
                          {c.farm?.farmCode || '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{c.riceVariety || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{c.estimatedYieldKg ? `${c.estimatedYieldKg} kg` : '—'}</td>
                    <td style={{ fontWeight: c.actualYieldKg ? 700 : 400, color: c.actualYieldKg ? 'var(--accent)' : 'var(--neutral-600)', fontSize: '13px' }}>
                      {c.actualYieldKg ? `${c.actualYieldKg} kg` : '—'}
                    </td>
                    <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
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
