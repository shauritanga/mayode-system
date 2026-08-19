'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { farmsApi } from '@/lib/api';
import { isFarmBoundaryMapped } from '@/lib/farm-geo';

const FarmsMap = dynamic(() => import('@/components/FarmsMap'), { ssr: false, loading: () => <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading map…</div> });

interface Farm {
  id: string;
  farmCode: string;
  name?: string;
  village?: string;
  socialHectares: number;
  grade: string;
  isVerified: boolean;
  isLeased: boolean;
  hasIrrigation: boolean;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  boundaryCoordinates?: unknown;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  mamcos?: { name: string };
}

type FarmFilter = 'all' | 'pending-boundary' | 'verified' | 'unmapped';

function filterFromUrl(): FarmFilter {
  if (typeof window === 'undefined') return 'all';
  const value = new URLSearchParams(window.location.search).get('filter');
  if (value === 'pending-boundary' || value === 'verified' || value === 'unmapped') return value;
  return 'all';
}

const gradeBadge = (grade: string) => ({
  A: <span className="badge badge-green">Grade A</span>,
  B: <span className="badge badge-gold">Grade B</span>,
  C: <span className="badge badge-red">Grade C</span>,
}[grade] || <span className="badge badge-gray">{grade}</span>);

export default function FarmsPage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filter, setFilter] = useState<FarmFilter>('all');

  useEffect(() => {
    setFilter(filterFromUrl());
    farmsApi.getAll()
      .then((res) => setFarms(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return farms.filter((f) => {
      const matchesSearch = `${f.farmCode} ${f.name || ''} ${f.farmer?.firstName || ''} ${f.farmer?.lastName || ''}`
        .toLowerCase()
        .includes(q);
      if (!matchesSearch) return false;
      if (filter === 'pending-boundary') return !f.isVerified && isFarmBoundaryMapped(f);
      if (filter === 'verified') return f.isVerified;
      if (filter === 'unmapped') return !isFarmBoundaryMapped(f);
      return true;
    });
  }, [farms, search, filter]);

  const pendingBoundary = farms.filter((f) => !f.isVerified && isFarmBoundaryMapped(f)).length;
  const mappedCount = farms.filter((f) => isFarmBoundaryMapped(f)).length;

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farms</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>
            All registered farm parcels & GPS boundaries
            {filter === 'pending-boundary' ? ' — mapped farms awaiting official boundary approval' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-tint)', borderRadius: 8, padding: 4 }}>
            <button className={view === 'list' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setView('list')}>List</button>
            <button className={view === 'map' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setView('map')}>Map</button>
          </div>
          <input
            id="farms-search"
            type="search"
            placeholder="Search farm code or farmer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ width: '280px' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {([
          { key: 'all', label: `All (${farms.length})` },
          { key: 'pending-boundary', label: `Boundary queue (${pendingBoundary})` },
          { key: 'verified', label: 'Verified' },
          { key: 'unmapped', label: 'Unmapped' },
        ] as const).map((chip) => (
          <button
            key={chip.key}
            className={filter === chip.key ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Farms', value: farms.length, color: 'var(--accent)' },
          { label: 'Verified', value: farms.filter((f) => f.isVerified).length, color: 'var(--green-400)' },
          { label: 'Boundary queue', value: pendingBoundary, color: 'var(--gold-400)' },
          { label: 'Currently Leased', value: farms.filter((f) => f.isLeased).length, color: 'var(--gold-400)' },
          { label: 'Total Hectares', value: farms.reduce((a, f) => a + f.socialHectares, 0).toFixed(1), color: 'var(--blue-500)' },
          { label: 'Boundary mapped', value: mappedCount, color: 'var(--purple-500)' },
        ].map((stat) => (
          <div key={stat.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: stat.color, fontFamily: 'Outfit, sans-serif' }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {view === 'map' && (
        <div className="glass-card" style={{ overflow: 'hidden', marginBottom: '24px', padding: 12 }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading farms…</div>
          ) : (
            <FarmsMap farms={filtered} />
          )}
        </div>
      )}

      {view === 'list' && (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading farms…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No farms found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Farm Code</th>
                    <th>Farmer</th>
                    <th>AMCOS</th>
                    <th>Hectares</th>
                    <th>Grade</th>
                    <th>Irrigation</th>
                    <th>Verified</th>
                    <th>Leased</th>
                    {filter === 'pending-boundary' && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((farm) => (
                    <tr key={farm.id}>
                      <td>
                        <Link href={`/dashboard/farms/${farm.id}`} style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px', textDecoration: 'none' }}>
                          {farm.farmCode}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{farm.farmer?.controlNumber}</div>
                      </td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{farm.mamcos?.name || '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{farm.socialHectares} ha</td>
                      <td>{gradeBadge(farm.grade)}</td>
                      <td>
                        <span className={`badge ${farm.hasIrrigation ? 'badge-green' : 'badge-gray'}`}>
                          {farm.hasIrrigation ? '✓ Yes' : '✕ No'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>
                          {farm.isVerified ? '✓ Verified' : '⏳ Pending'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${farm.isLeased ? 'badge-blue' : 'badge-gray'}`}>
                          {farm.isLeased ? '🔒 Leased' : 'Available'}
                        </span>
                      </td>
                      {filter === 'pending-boundary' && (
                        <td>
                          <Link href={`/dashboard/farms/${farm.id}`} className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', textDecoration: 'none' }}>
                            Review boundary
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
