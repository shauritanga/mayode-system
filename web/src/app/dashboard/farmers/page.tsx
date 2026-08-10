'use client';
import { useEffect, useState } from 'react';
import { farmersApi, mamcosApi } from '@/lib/api';

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
  assignedOfficerId?: string | null;
  mamcos?: { name: string };
}

interface FieldOfficer {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string | null;
  mamcos?: { name: string } | null;
}

const statusBadge = (blacklisted: boolean) => (
  <span className={`badge ${blacklisted ? 'badge-red' : 'badge-green'}`}>
    {blacklisted ? '⛔ Blacklisted' : '✓ Active'}
  </span>
);

export default function FarmersPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [officers, setOfficers] = useState<FieldOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([farmersApi.getAll(), mamcosApi.fieldOfficers()]).then(([farmerResult, officerResult]) => {
      if (farmerResult.status === 'fulfilled') setFarmers(farmerResult.value.data?.data || farmerResult.value.data || []);
      else console.error(farmerResult.reason);
      if (officerResult.status === 'fulfilled') setOfficers(officerResult.value.data || []);
      setLoading(false);
    });
  }, []);

  const handleAssign = async (farmerId: string, officerId: string) => {
    if (!officerId) return;
    setAssigningId(farmerId);
    try {
      await farmersApi.assignOfficer(farmerId, officerId);
      setFarmers((prev) => prev.map((f) => (f.id === farmerId ? { ...f, assignedOfficerId: officerId || null } : f)));
    } catch (err) {
      console.error(err);
    } finally {
      setAssigningId(null);
    }
  };

  const filtered = farmers.filter(f =>
    `${f.firstName} ${f.lastName} ${f.controlNumber}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farmers</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>All registered cooperative farmers</p>
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
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading farmers…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
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
                  <th>Assigned Officer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(farmer => (
                  <tr key={farmer.id}>
                    <td>
                      <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                        {farmer.controlNumber}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{farmer.firstName} {farmer.lastName}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{farmer.ward || '—'}, {farmer.district || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{farmer.mamcos?.name || '—'}</td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: farmer.creditScore >= 70 ? 'var(--accent)' : farmer.creditScore >= 40 ? 'var(--gold-400)' : 'var(--red-500)',
                      }}>
                        {farmer.creditScore.toFixed(1)}
                      </span>
                    </td>
                    <td>{statusBadge(farmer.isBlacklisted)}</td>
                    <td>
                      <select
                        className="input-field"
                        style={{ fontSize: '12px', padding: '4px 8px', minWidth: '160px' }}
                        value={farmer.assignedOfficerId || ''}
                        disabled={assigningId === farmer.id}
                        onChange={(e) => handleAssign(farmer.id, e.target.value)}
                      >
                        <option value="">
                          {farmer.assignedOfficerId ? 'Change officer…' : 'Unassigned'}
                        </option>
                        {officers.map((officer) => (
                          <option key={officer.id} value={officer.id}>
                            {officer.firstName} {officer.lastName}
                            {officer.mamcos?.name ? ` — ${officer.mamcos.name}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--neutral-600)' }}>
        Showing {filtered.length} of {farmers.length} farmers
      </div>
    </div>
  );
}
