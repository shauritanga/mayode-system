'use client';
import { useEffect, useState } from 'react';
import { financeApi, farmersApi } from '@/lib/api';

interface FinanceSummary {
  totalRevenue: number;
  totalCosts: number;
  netProfit: number;
  costPerKg?: number;
  revenuePerKg?: number;
  totalYieldKg?: number;
}

export default function FinancePage() {
  const [farmerId, setFarmerId] = useState('');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [farmers, setFarmers] = useState<{ id: string; firstName: string; lastName: string; controlNumber: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    farmersApi.getAll()
      .then(res => setFarmers(res.data?.data || res.data || []))
      .catch(console.error);
  }, []);

  const handleSearch = async () => {
    if (!farmerId) return;
    setLoading(true);
    setSummary(null);
    try {
      const res = await financeApi.getFarmerSummary(farmerId);
      setSummary(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isProfit = summary && summary.netProfit >= 0;

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, #F59E0B, #FCD34D)', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: '#F9FAFB' }}>Finance & Profitability</h1>
        </div>
        <p style={{ fontSize: '13px', color: '#6B7280', marginLeft: '14px' }}>Automated profit/loss analytics per farmer</p>
      </div>

      {/* Farmer selector */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '16px' }}>Select Farmer to Analyse</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            id="farmer-select"
            value={farmerId}
            onChange={e => setFarmerId(e.target.value)}
            className="input-field"
            style={{ flex: '1', minWidth: '200px', maxWidth: '360px', background: '#1F2937', color: farmerId ? '#F9FAFB' : '#6B7280' }}
          >
            <option value="">— Select a farmer —</option>
            {farmers.map(f => (
              <option key={f.id} value={f.id}>
                {f.firstName} {f.lastName} ({f.controlNumber})
              </option>
            ))}
          </select>
          <button
            id="finance-search-btn"
            onClick={handleSearch}
            disabled={!farmerId || loading}
            className="btn-primary"
            style={{ opacity: !farmerId || loading ? 0.6 : 1 }}
          >
            {loading ? 'Loading…' : 'View Financial Summary'}
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Total Revenue', value: `${Number(summary.totalRevenue).toLocaleString()} TZS`, color: '#10B981', icon: '📈' },
              { label: 'Total Costs', value: `${Number(summary.totalCosts).toLocaleString()} TZS`, color: '#EF4444', icon: '📉' },
              {
                label: 'Net Profit / Loss',
                value: `${summary.netProfit >= 0 ? '+' : ''}${Number(summary.netProfit).toLocaleString()} TZS`,
                color: isProfit ? '#10B981' : '#EF4444',
                icon: isProfit ? '✅' : '⚠️',
              },
              { label: 'Total Yield', value: summary.totalYieldKg ? `${summary.totalYieldKg.toFixed(0)} kg` : '—', color: '#F59E0B', icon: '🌾' },
              { label: 'Cost per kg', value: summary.costPerKg ? `${summary.costPerKg.toFixed(0)} TZS` : '—', color: '#9CA3AF', icon: '⚖️' },
              { label: 'Revenue per kg', value: summary.revenuePerKg ? `${summary.revenuePerKg.toFixed(0)} TZS` : '—', color: '#34D399', icon: '💰' },
            ].map(stat => (
              <div key={stat.label} className="stat-card" style={{ padding: '20px' }}>
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: stat.color, fontFamily: 'Outfit, sans-serif', marginBottom: '4px' }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Profitability verdict */}
          <div style={{
            padding: '20px 24px',
            borderRadius: '16px',
            background: isProfit ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${isProfit ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: isProfit ? '#10B981' : '#EF4444', marginBottom: '4px' }}>
              {isProfit ? '✅ Farm is Profitable' : '⚠️ Farm is Operating at a Loss'}
            </div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>
              {isProfit
                ? `This farmer has generated a net profit of ${Number(summary.netProfit).toLocaleString()} TZS across all crop cycles.`
                : `This farmer has incurred a net loss of ${Math.abs(summary.netProfit).toLocaleString()} TZS. Review input costs and yield performance.`}
            </div>
          </div>
        </div>
      )}

      {!summary && !loading && (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#6B7280' }}>Select a farmer to view their financial profitability summary</div>
        </div>
      )}
    </div>
  );
}
