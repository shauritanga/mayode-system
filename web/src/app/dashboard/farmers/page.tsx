'use client';
import { useEffect, useState } from 'react';
import { farmersApi } from '@/lib/api';

interface Farmer {
  id: string;
  controlNumber: string;
  firstName: string;
  lastName: string;
  district?: string;
  region?: string;
  ward?: string;
  creditScore: number;
  isBlacklisted: boolean;
  mamcos?: { name: string };
}

const statusBadge = (blacklisted: boolean) => (
  <span className={`badge ${blacklisted ? 'badge-red' : 'badge-green'}`}>
    {blacklisted ? '⛔ Blacklisted' : '✓ Active'}
  </span>
);

export default function FarmersPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    farmersApi.getAll()
      .then(res => setFarmers(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = farmers.filter(f =>
    `${f.firstName} ${f.lastName} ${f.controlNumber}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, #10B981, #34D399)', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: '#F9FAFB' }}>Farmers</h1>
          </div>
          <p style={{ fontSize: '13px', color: '#6B7280', marginLeft: '14px' }}>All registered cooperative farmers</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            id="farmers-search"
            type="search"
            placeholder="Search by name or control number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field"
            style={{ width: '280px' }}
          />
        </div>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>Loading farmers…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
            {search ? `No farmers matching "${search}"` : 'No farmers registered yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Control No.</th>
                  <th>Full Name</th>
                  <th>Location</th>
                  <th>AMCOS</th>
                  <th>Credit Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(farmer => (
                  <tr key={farmer.id}>
                    <td>
                      <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#10B981', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                        {farmer.controlNumber}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#F9FAFB' }}>{farmer.firstName} {farmer.lastName}</td>
                    <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{farmer.ward || '—'}, {farmer.district || '—'}</td>
                    <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{farmer.mamcos?.name || '—'}</td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: farmer.creditScore >= 70 ? '#10B981' : farmer.creditScore >= 40 ? '#F59E0B' : '#EF4444',
                      }}>
                        {farmer.creditScore.toFixed(1)}
                      </span>
                    </td>
                    <td>{statusBadge(farmer.isBlacklisted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '14px', fontSize: '12px', color: '#4B5563' }}>
        Showing {filtered.length} of {farmers.length} farmers
      </div>
    </div>
  );
}
