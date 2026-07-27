'use client';
import { useEffect, useState } from 'react';
import { inventoryApi } from '@/lib/api';

interface InventoryRecord {
  id: string;
  trackingCode: string;
  weightKg: number;
  qualityGrade?: string;
  warehouseLocation?: string;
  status: string;
  receivedDate: string;
  farm?: { farmCode: string };
  farmer?: { firstName: string; lastName: string };
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    RECEIVED: 'badge-blue',
    IN_STORAGE: 'badge-green',
    BATCHED: 'badge-gold',
    SHIPPED: 'badge-gray',
    SOLD: 'badge-gray',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status.replace('_', ' ')}</span>;
};

export default function InventoryPage() {
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    inventoryApi.getAll()
      .then(res => setRecords(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = records.filter(r =>
    `${r.trackingCode} ${r.farmer?.firstName} ${r.farmer?.lastName} ${r.farm?.farmCode}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalKg = records.reduce((a, r) => a + r.weightKg, 0);

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--blue-500), var(--blue-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Inventory</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Warehouse receipts & Fairtrade batch tracking</p>
        </div>
        <input
          id="inventory-search"
          type="search"
          placeholder="Search tracking code or farmer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ width: '280px' }}
        />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Receipts', value: records.length, color: 'var(--blue-500)' },
          { label: 'Total Weight', value: `${totalKg.toFixed(0)} kg`, color: 'var(--accent)' },
          { label: 'In Storage', value: records.filter(r => r.status === 'IN_STORAGE').length, color: 'var(--gold-400)' },
          { label: 'Batched', value: records.filter(r => r.status === 'BATCHED').length, color: 'var(--purple-500)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading inventory…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No inventory records found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tracking Code</th>
                  <th>Farmer</th>
                  <th>Farm Code</th>
                  <th>Weight</th>
                  <th>Quality</th>
                  <th>Warehouse Bay</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--blue-500)', fontWeight: 600, background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                        {r.trackingCode}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)' }}>{r.farm?.farmCode || '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.weightKg} kg</td>
                    <td>
                      {r.qualityGrade
                        ? <span className="badge badge-green">{r.qualityGrade}</span>
                        : <span style={{ color: 'var(--neutral-600)', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{r.warehouseLocation || '—'}</td>
                    <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                      {new Date(r.receivedDate).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
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
