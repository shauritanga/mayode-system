'use client';
import { useEffect, useState } from 'react';
import { accountingApi, financeApi, farmersApi } from '@/lib/api';

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
  const [statements, setStatements] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    farmersApi.getAll()
      .then(res => setFarmers(res.data?.data || res.data || []))
      .catch(console.error);
    accountingApi.statements()
      .then(res => setStatements(res.data))
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
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Finance & Profitability</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Automated profit/loss analytics per farmer</p>
      </div>

      {/* Farmer selector */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Select Farmer to Analyse</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            id="farmer-select"
            value={farmerId}
            onChange={e => setFarmerId(e.target.value)}
            className="input-field"
            style={{ flex: '1', minWidth: '200px', maxWidth: '360px', background: 'var(--neutral-800)', color: farmerId ? 'var(--text-primary)' : 'var(--neutral-500)' }}
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

      {statements && (
        <div className="animate-fade-in" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, margin: 0 }}>Cooperative Financial Statements</h2>
              <p className="muted" style={{ margin: '4px 0 0' }}>Formal accounting view from the general ledger.</p>
            </div>
            <span className={`badge ${statements.trialBalance?.balanced ? 'badge-green' : 'badge-gold'}`}>
              Trial balance {statements.trialBalance?.balanced ? 'balanced' : 'needs review'}
            </span>
          </div>
          <div className="metric-grid">
            {[
              ['Income', statements.profitAndLoss?.income, 'Ledger income accounts'],
              ['Expenses', statements.profitAndLoss?.expenses, 'Ledger expense accounts'],
              ['Net surplus', statements.profitAndLoss?.netProfit, 'Income less expenses'],
              ['Assets', statements.balanceSheet?.assets, 'Cash, receivables and assets'],
              ['Liabilities', statements.balanceSheet?.liabilities, 'Payables and obligations'],
              ['Working capital', statements.workingCapital, 'Assets less liabilities'],
              ['Net cash flow', statements.cashFlow?.netCashFlow, 'Cash/mobile-money movement'],
              ['Receivables', statements.receivablesTotal, 'Open buyer invoices'],
              ['Payables', statements.payablesTotal, 'Open supplier bills'],
            ].map(([label, value, sub]) => (
              <div key={String(label)} className="stat-card" style={{ padding: 18 }}>
                <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                <strong style={{ display: 'block', fontSize: 20, marginTop: 6 }}>TZS {Math.round(Number(value || 0)).toLocaleString()}</strong>
                <small className="muted">{sub}</small>
              </div>
            ))}
          </div>
          <div className="table-panel" style={{ marginTop: 16 }}>
            <div className="section-toolbar"><strong>Financial Ratios</strong><span className="muted">Liquidity · Profitability · Solvency</span></div>
            <div className="metric-grid" style={{ padding: 16 }}>
              {[
                ['Liquidity', statements.ratios?.liquidity, 'Assets / liabilities'],
                ['Profitability', statements.ratios?.profitability, 'Net surplus / income'],
                ['Solvency', statements.ratios?.solvency, '(Assets - liabilities) / assets'],
              ].map(([label, value, sub]) => (
                <div key={String(label)} className="stat-card" style={{ padding: 16 }}>
                  <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                  <strong style={{ display: 'block', fontSize: 22, marginTop: 6 }}>{value == null ? '—' : Number(value).toFixed(2)}</strong>
                  <small className="muted">{sub}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Total Revenue', value: `${Number(summary.totalRevenue).toLocaleString()} TZS`, color: 'var(--accent)', icon: '📈' },
              { label: 'Total Costs', value: `${Number(summary.totalCosts).toLocaleString()} TZS`, color: 'var(--red-500)', icon: '📉' },
              {
                label: 'Net Profit / Loss',
                value: `${summary.netProfit >= 0 ? '+' : ''}${Number(summary.netProfit).toLocaleString()} TZS`,
                color: isProfit ? 'var(--accent)' : 'var(--red-500)',
                icon: isProfit ? '✅' : '⚠️',
              },
              { label: 'Total Yield', value: summary.totalYieldKg ? `${summary.totalYieldKg.toFixed(0)} kg` : '—', color: 'var(--gold-400)', icon: '🌾' },
              { label: 'Cost per kg', value: summary.costPerKg ? `${summary.costPerKg.toFixed(0)} TZS` : '—', color: 'var(--neutral-400)', icon: '⚖️' },
              { label: 'Revenue per kg', value: summary.revenuePerKg ? `${summary.revenuePerKg.toFixed(0)} TZS` : '—', color: 'var(--green-400)', icon: '💰' },
            ].map(stat => (
              <div key={stat.label} className="stat-card" style={{ padding: '20px' }}>
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: stat.color, fontFamily: 'Outfit, sans-serif', marginBottom: '4px' }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{stat.label}</div>
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
            <div style={{ fontSize: '15px', fontWeight: 700, color: isProfit ? 'var(--accent)' : 'var(--red-500)', marginBottom: '4px' }}>
              {isProfit ? '✅ Farm is Profitable' : '⚠️ Farm is Operating at a Loss'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--neutral-400)' }}>
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
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--neutral-500)' }}>Select a farmer to view their financial profitability summary</div>
        </div>
      )}
    </div>
  );
}
