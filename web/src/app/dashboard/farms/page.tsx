'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { farmsApi } from '@/lib/api';

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
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  mamcos?: { name: string };
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

  useEffect(() => {
    farmsApi.getAll()
      .then(res => setFarms(res.data?.data || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = farms.filter(f =>
    `${f.farmCode} ${f.name || ''} ${f.farmer?.firstName || ''} ${f.farmer?.lastName || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farms</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>All registered farm parcels & GPS boundaries</p>
        </div>
        <input
          id="farms-search"
          type="search"
          placeholder="Search farm code or farmer name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ width: '280px' }}
        />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Farms', value: farms.length, color: 'var(--accent)' },
          { label: 'Verified', value: farms.filter(f => f.isVerified).length, color: 'var(--green-400)' },
          { label: 'Currently Leased', value: farms.filter(f => f.isLeased).length, color: 'var(--gold-400)' },
          { label: 'Total Hectares', value: farms.reduce((a, f) => a + f.socialHectares, 0).toFixed(1), color: 'var(--blue-500)' },
        ].map(stat => (
          <div key={stat.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: stat.color, fontFamily: 'Outfit, sans-serif' }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

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
                </tr>
              </thead>
              <tbody>
                {filtered.map(farm => (
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
