'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi, farmersApi, farmsApi, mamcosApi, marketplaceApi, financeApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import Modal from '@/components/Modal';

const AMCOS_OPS_ACTIONS = [
  { label: 'Register New Farmer', href: '/dashboard/farmers', icon: '👤', color: 'var(--accent)' },
  { label: 'Register New Farm', href: '/dashboard/farms', icon: '🌾', color: 'var(--green-400)' },
  { label: 'Log Crop Activity', href: '/dashboard/crop-cycles', icon: '🌱', color: 'var(--gold-400)' },
  { label: 'Receive Inventory', href: '/dashboard/inventory', icon: '📦', color: 'var(--blue-500)' },
  { label: 'Post Land Listing', href: '/dashboard/marketplace', icon: '🏪', color: 'var(--purple-500)' },
];

const EMPTY_OFFICER_FORM = { firstName: '', lastName: '', phone: '', password: '', assignedArea: '' };

const ADMIN_ACTIONS = [
  { label: 'Manage Seasons', href: '/dashboard/seasons', icon: '📅', color: 'var(--accent)' },
  { label: 'Review Disputes', href: '/dashboard/disputes', icon: '⚠️', color: 'var(--red-400)' },
  { label: 'Manage AMCOS', href: '/dashboard/mamcos', icon: '🏛', color: 'var(--gold-400)' },
  { label: 'New Reward Campaign', href: '/dashboard/rewards', icon: '🎁', color: 'var(--blue-500)' },
  { label: 'Post Land Listing', href: '/dashboard/marketplace', icon: '🏪', color: 'var(--purple-500)' },
];

interface StatCard {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color: string;
}

function StatCard({ label, value, sub, icon, color }: StatCard) {
  return (
    <div className="stat-card animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: '14px',
        background: `${color}18`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '24px', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.2 }}>
          {value}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--neutral-400)', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: color, marginTop: '2px', fontWeight: 500 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isSecretary = role === 'MAMCOS_SECRETARY';
  const quickActions = role === 'ADMIN' ? ADMIN_ACTIONS : AMCOS_OPS_ACTIONS;
  const [stats, setStats] = useState({
    farmers: 0, farms: 0, mamcos: 0, listings: 0
  });
  const [mamcosName, setMamcosName] = useState('');
  const [prices, setPrices] = useState<{ commodity: string; price: number; market: string; recordedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOfficerForm, setShowOfficerForm] = useState(false);
  const [officerForm, setOfficerForm] = useState<any>({ ...EMPTY_OFFICER_FORM });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        if (isSecretary) {
          const [dashRes, listingsRes, pricesRes] = await Promise.allSettled([
            mamcosApi.dashboard(),
            marketplaceApi.getLandListings(),
            marketplaceApi.getMarketPrices(),
          ]);
          const m = dashRes.status === 'fulfilled' ? dashRes.value.data?.mamcos : null;
          setMamcosName(m?.name || '');
          setStats({
            farmers: m?.farmers?.length ?? 0,
            farms: m?.farms?.length ?? 0,
            mamcos: m?.farms?.filter((f: any) => f.isVerified)?.length ?? 0,
            listings: listingsRes.status === 'fulfilled' ? listingsRes.value.data?.length || 0 : 0,
          });
          if (pricesRes.status === 'fulfilled') setPrices(pricesRes.value.data?.slice(0, 5) || []);
          return;
        }

        const [farmersRes, farmsRes, mamcosRes, listingsRes, pricesRes] = await Promise.allSettled([
          farmersApi.getAll(),
          farmsApi.getAll(),
          mamcosApi.getAll(),
          marketplaceApi.getLandListings(),
          marketplaceApi.getMarketPrices(),
        ]);

        setStats({
          farmers: farmersRes.status === 'fulfilled' ? farmersRes.value.data?.total || farmersRes.value.data?.length || 0 : 0,
          farms: farmsRes.status === 'fulfilled' ? farmsRes.value.data?.total || farmsRes.value.data?.length || 0 : 0,
          mamcos: mamcosRes.status === 'fulfilled' ? mamcosRes.value.data?.length || 0 : 0,
          listings: listingsRes.status === 'fulfilled' ? listingsRes.value.data?.length || 0 : 0,
        });
        if (pricesRes.status === 'fulfilled') {
          setPrices(pricesRes.value.data?.slice(0, 5) || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSecretary]);

  const createOfficer = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMessage('');
    try {
      await authApi.createStaff({ ...officerForm, role: 'FIELD_OFFICER' });
      setMessage('Field Officer account created successfully.');
      setOfficerForm({ ...EMPTY_OFFICER_FORM });
      setShowOfficerForm(false);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Could not create Field Officer account.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{ width: '4px', height: '28px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {isSecretary ? (mamcosName || 'Your AMCOS') : 'System Overview'}
          </h1>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--neutral-500)', marginLeft: '16px' }}>
          {isSecretary ? 'Your cooperative scheme — MAYODE GROUP' : 'MAYODE GROUP — MAYOData Platform & M-LAX Marketplace'}
        </p>
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)' }}>{message}</div>}

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard label={isSecretary ? 'Your Farmers' : 'Registered Farmers'} value={loading ? '—' : stats.farmers} sub="Active members" icon="👤" color="var(--accent)" />
        <StatCard label={isSecretary ? 'Your Farms' : 'Registered Farms'} value={loading ? '—' : stats.farms} sub="GPS mapped" icon="🌾" color="var(--green-400)" />
        {isSecretary ? (
          <StatCard label="Verified Farms" value={loading ? '—' : stats.mamcos} sub="Boundary confirmed" icon="✅" color="var(--gold-400)" />
        ) : (
          <StatCard label="AMCOS Schemes" value={loading ? '—' : stats.mamcos} sub="Active cooperatives" icon="🏛" color="var(--gold-400)" />
        )}
        <StatCard label="M-LAX Listings" value={loading ? '—' : stats.listings} sub="Land & tractor ads" icon="🏪" color="var(--blue-500)" />
      </div>

      {/* Content Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Market Prices */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>📊 Latest Market Prices</h2>
            <span style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>TZS / kg</span>
          </div>
          {prices.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--neutral-600)', fontSize: '14px', padding: '32px 0' }}>
              No market prices recorded yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {prices.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-tint)', borderRadius: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.commodity}</div>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{p.market || 'Market unknown'}</div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent)' }}>
                    {Number(p.price).toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>TZS</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>⚡ Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {isSecretary && (
              <button
                onClick={() => setShowOfficerForm(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                  background: 'var(--surface-tint)', borderRadius: '10px', border: '1px solid transparent',
                  cursor: 'pointer', textAlign: 'left', width: '100%', font: 'inherit',
                }}
              >
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>🧑‍🌾</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--neutral-300)' }}>Create Field Officer</span>
                <span style={{ marginLeft: 'auto', fontSize: '14px', color: 'var(--accent)' }}>→</span>
              </button>
            )}
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                  background: 'var(--surface-tint)', borderRadius: '10px', textDecoration: 'none',
                  border: '1px solid transparent', transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget;
                  el.style.borderColor = action.color + '40';
                  el.style.background = action.color + '10';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget;
                  el.style.borderColor = 'transparent';
                  el.style.background = 'var(--surface-tint)';
                }}
              >
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{action.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--neutral-300)' }}>{action.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '14px', color: action.color }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {showOfficerForm && (
        <Modal
          title="Create Field Officer"
          onClose={() => setShowOfficerForm(false)}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowOfficerForm(false)} disabled={creating}>Cancel</button>
              <button className="btn-primary" onClick={createOfficer} disabled={creating}>{creating ? 'Saving…' : 'Create staff account'}</button>
            </>
          }
        >
          <form onSubmit={createOfficer} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="First name" required value={officerForm.firstName} onChange={e => setOfficerForm({ ...officerForm, firstName: e.target.value })} />
            <input className="input-field" placeholder="Last name" required value={officerForm.lastName} onChange={e => setOfficerForm({ ...officerForm, lastName: e.target.value })} />
            <input className="input-field" placeholder="Phone +255…" required value={officerForm.phone} onChange={e => setOfficerForm({ ...officerForm, phone: e.target.value })} />
            <input className="input-field" type="password" minLength={6} placeholder="Temporary password" required value={officerForm.password} onChange={e => setOfficerForm({ ...officerForm, password: e.target.value })} />
            <input className="input-field" placeholder="Assigned area" value={officerForm.assignedArea} onChange={e => setOfficerForm({ ...officerForm, assignedArea: e.target.value })} />
          </form>
        </Modal>
      )}
    </div>
  );
}
