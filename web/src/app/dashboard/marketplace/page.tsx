'use client';
import { useEffect, useState } from 'react';
import { marketplaceApi } from '@/lib/api';

interface LandListing {
  id: string;
  askingPrice: number;
  suggestedPrice?: number;
  dealType: string;
  leaseStatus: string;
  leaseDurationMonths: number;
  commissionRate: number;
  commissionAmount?: number;
  isFlashDeal: boolean;
  farm?: { farmCode: string; socialHectares: number; grade: string };
  owner?: { firstName: string; lastName: string; controlNumber: string };
  renter?: { firstName: string; lastName: string };
  createdAt: string;
}

interface Tractor {
  id: string;
  registrationNo: string;
  model?: string;
  horsePower?: number;
  isAvailable: boolean;
  location?: string;
  pricePerHectare?: number;
  owner?: { name: string; phone: string };
}

interface MarketPrice {
  id: string;
  commodity: string;
  price: number;
  market?: string;
  source?: string;
  recordedAt: string;
}

const leaseStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'badge-gray',
    PENDING_VERIFICATION: 'badge-gold',
    ACTIVE: 'badge-green',
    COMPLETED: 'badge-blue',
    TERMINATED: 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status.replace('_', ' ')}</span>;
};

export default function MarketplacePage() {
  const [listings, setListings] = useState<LandListing[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'land' | 'tractors' | 'prices'>('land');

  useEffect(() => {
    Promise.allSettled([
      marketplaceApi.getLandListings(),
      marketplaceApi.getTractors(),
      marketplaceApi.getMarketPrices(),
    ]).then(([l, t, p]) => {
      if (l.status === 'fulfilled') setListings(l.value.data || []);
      if (t.status === 'fulfilled') setTractors(t.value.data || []);
      if (p.status === 'fulfilled') setPrices(p.value.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--neutral-500)',
    borderColor: active ? 'rgba(16, 185, 129, 0.3)' : 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    transition: 'all 0.2s ease',
  });

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--purple-500), var(--purple-400))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>M-LAX Marketplace</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Land Leasing, Tractor Services & Market Intelligence</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button id="tab-land" style={tabStyle(tab === 'land')} onClick={() => setTab('land')}>🌾 Land Listings ({listings.length})</button>
        <button id="tab-tractors" style={tabStyle(tab === 'tractors')} onClick={() => setTab('tractors')}>🚜 Tractors ({tractors.length})</button>
        <button id="tab-prices" style={tabStyle(tab === 'prices')} onClick={() => setTab('prices')}>📊 Market Prices ({prices.length})</button>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading marketplace data…</div>
      ) : (
        <>
          {/* Land Listings */}
          {tab === 'land' && (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {listings.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No land listings posted yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Farm</th>
                        <th>Owner</th>
                        <th>Asking Price</th>
                        <th>AI Price</th>
                        <th>Deal Type</th>
                        <th>Duration</th>
                        <th>Commission</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listings.map(l => (
                        <tr key={l.id}>
                          <td>
                            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>{l.farm?.farmCode}</div>
                            <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{l.farm?.socialHectares} ha · Grade {l.farm?.grade}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{l.owner?.firstName} {l.owner?.lastName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{l.owner?.controlNumber}</div>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{Number(l.askingPrice).toLocaleString()} TZS</td>
                          <td style={{ color: 'var(--gold-400)', fontSize: '12px' }}>{l.suggestedPrice ? `${Number(l.suggestedPrice).toLocaleString()} TZS` : '—'}</td>
                          <td>
                            <span className={`badge ${l.isFlashDeal ? 'badge-red' : l.dealType === 'RELATIONSHIP' ? 'badge-blue' : 'badge-gold'}`}>
                              {l.isFlashDeal ? '⚡ Flash' : l.dealType}
                            </span>
                          </td>
                          <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{l.leaseDurationMonths} months</td>
                          <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{(l.commissionRate * 100).toFixed(0)}%</td>
                          <td>{leaseStatusBadge(l.leaseStatus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tractors */}
          {tab === 'tractors' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {tractors.length === 0 ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px', gridColumn: '1/-1' }}>
                  No tractors registered yet.
                </div>
              ) : tractors.map((t, idx) => (
                <div key={t.id} className="glass-card animate-fade-in" style={{ padding: '20px', animationDelay: `${idx * 0.05}s` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.model || 'Unknown Model'}</div>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent)', marginTop: '2px' }}>{t.registrationNo}</div>
                    </div>
                    <span className={`badge ${t.isAvailable ? 'badge-green' : 'badge-red'}`}>
                      {t.isAvailable ? '✓ Available' : '✕ Booked'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--neutral-400)' }}>
                    <div>⚡ {t.horsePower ?? '—'} HP</div>
                    <div>📍 {t.location || '—'}</div>
                    <div>👤 {t.owner?.name || '—'}</div>
                    <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {t.pricePerHectare ? `${Number(t.pricePerHectare).toLocaleString()} TZS/ha` : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Market Prices */}
          {tab === 'prices' && (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {prices.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No market prices recorded yet.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Commodity</th>
                      <th>Price (TZS/kg)</th>
                      <th>Market</th>
                      <th>Source</th>
                      <th>Date Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.commodity}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '15px' }}>
                          {Number(p.price).toLocaleString()}
                        </td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{p.market || '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{p.source || '—'}</td>
                        <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                          {new Date(p.recordedAt).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
