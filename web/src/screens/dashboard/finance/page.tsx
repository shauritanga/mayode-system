'use client';
import { useEffect, useState } from 'react';
import { accountingApi, financeApi, farmersApi, suppliersApi, loansApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface FinanceSummary {
  totalRevenue: number;
  totalCosts: number;
  netProfit: number;
  costPerKg?: number;
  revenuePerKg?: number;
  totalYieldKg?: number;
}

interface InputCostRow {
  id: string;
  category: string;
  itemName: string;
  totalCost: number;
  paymentStatus?: string;
  supplier?: string;
  loanRecordId?: string;
  dateIncurred: string;
  supplierRecord?: { name: string } | null;
  cropCycle?: { farmer?: { firstName: string; lastName: string; controlNumber: string } };
}

interface Account { id: string; code: string; name: string; type: string }
interface Invoice {
  id: string; invoiceNumber: string; amount: number; dueDate: string; status: string;
  buyer?: { name: string } | null;
}
interface Bill {
  id: string; billNumber: string; supplier: string; amount: number; dueDate: string; status: string;
  supplierRef?: { name: string } | null;
}
interface Budget {
  id: string; name: string; fiscalYear?: number; seasonLabel?: string; startDate: string; endDate: string;
  lines: { id: string; amount: number; account?: Account; accountId: string; actual?: number; variance?: number }[];
}
interface Lender {
  id: string; name: string; contactPerson?: string; contactPhone?: string; payoutPhone?: string; payoutName?: string;
  interestRatePercent?: number; isActive: boolean; _count?: { loans: number };
}
interface LoanRow {
  id: string; lenderName: string; originalAmount: number; amountOwed: number; autoDeductPercent?: number; isActive: boolean;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  lender?: { name: string } | null;
}

const paymentStatusBadge = (status?: string) => {
  const map: Record<string, string> = { PAID: 'badge-green', PARTIAL: 'badge-gold', PENDING: 'badge-red' };
  return <span className={`badge ${map[status || 'PENDING'] || 'badge-gray'}`}>{status || 'PENDING'}</span>;
};

const invoiceStatusBadge = (status: string) => {
  const map: Record<string, string> = { OPEN: 'badge-blue', OVERDUE: 'badge-red', PAID: 'badge-green', VOID: 'badge-gray' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'ledger', label: 'General Ledger' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'payables', label: 'Payables' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'loans', label: 'Loans & Lenders' },
] as const;
type TabKey = typeof TABS[number]['key'];

export default function FinancePage() {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Finance and Accounting</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>General ledger, receivables, payables, budgets, and third-party loans</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '8px 16px' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'payables' && <PayablesTab />}
      {tab === 'budgets' && <BudgetsTab />}
      {tab === 'loans' && <LoansTab />}
    </div>
  );
}

// ──────────────────────────── Overview ────────────────────────────

function OverviewTab() {
  const [farmerId, setFarmerId] = useState('');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [farmers, setFarmers] = useState<{ id: string; firstName: string; lastName: string; controlNumber: string }[]>([]);
  const [statements, setStatements] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [inputCosts, setInputCosts] = useState<InputCostRow[]>([]);

  useEffect(() => {
    farmersApi.getAll()
      .then(res => setFarmers(res.data?.data || res.data || []))
      .catch(console.error);
    accountingApi.statements()
      .then(res => setStatements(res.data))
      .catch(console.error);
    financeApi.getAllCosts()
      .then(res => setInputCosts(res.data || []))
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
            <div className="section-toolbar"><strong>Financial Ratio Analysis</strong><span className="muted">Liquidity · Profitability · Solvency</span></div>
            <div className="metric-grid" style={{ padding: 16 }}>
              {[
                ['Current ratio', statements.ratios?.liquidity?.currentRatio, 'Assets / liabilities'],
                ['Quick ratio', statements.ratios?.liquidity?.quickRatio, 'Cash / liabilities'],
                ['Net profit margin', statements.ratios?.profitability?.netProfitMargin, 'Net surplus / income'],
                ['Return on assets', statements.ratios?.profitability?.returnOnAssets, 'Net surplus / assets'],
                ['Debt-to-equity', statements.ratios?.solvency?.debtToEquityRatio, 'Liabilities / owners’ equity'],
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

      <div className="table-panel" style={{ marginTop: 24 }}>
        <div className="section-toolbar"><strong>Platform Input Costs</strong><span className="muted">{inputCosts.length} records · supplier, payment status &amp; loan-financing link</span></div>
        {inputCosts.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No input costs recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Farmer</th>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Total</th>
                  <th>Supplier</th>
                  <th>Payment status</th>
                  <th>Financing</th>
                </tr>
              </thead>
              <tbody>
                {inputCosts.slice(0, 100).map((cost) => (
                  <tr key={cost.id}>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{new Date(cost.dateIncurred).toLocaleDateString()}</td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{cost.cropCycle?.farmer ? `${cost.cropCycle.farmer.firstName} ${cost.cropCycle.farmer.lastName}` : '—'}</td>
                    <td style={{ fontSize: '12px' }}>{cost.category}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cost.itemName}</td>
                    <td style={{ fontWeight: 700 }}>{Number(cost.totalCost).toLocaleString()} TZS</td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{cost.supplierRecord?.name || cost.supplier || '—'}</td>
                    <td>{paymentStatusBadge(cost.paymentStatus)}</td>
                    <td>{cost.loanRecordId ? <span className="badge badge-blue">Loan-linked</span> : <span style={{ color: 'var(--neutral-600)', fontSize: '12px' }}>—</span>}</td>
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

// ──────────────────────────── General Ledger ────────────────────────────

function LedgerTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [trial, setTrial] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    accountingApi.trialBalance(from || to ? { from: from || undefined, to: to || undefined } : undefined)
      .then((res) => setTrial(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="glass-card" style={{ padding: 18, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="form-label">From
          <input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="form-label">To
          <input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={load}>Apply</button>
      </div>

      {loading ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading trial balance…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="stat-card" style={{ padding: 16, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12 }}>Total debit</div>
              <strong style={{ fontSize: 20 }}>TZS {Number(trial?.totalDebit || 0).toLocaleString()}</strong>
            </div>
            <div className="stat-card" style={{ padding: 16, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12 }}>Total credit</div>
              <strong style={{ fontSize: 20 }}>TZS {Number(trial?.totalCredit || 0).toLocaleString()}</strong>
            </div>
            <div className="stat-card" style={{ padding: 16, flex: 1 }}>
              <div className="muted" style={{ fontSize: 12 }}>Balanced</div>
              <span className={`badge ${trial?.balanced ? 'badge-green' : 'badge-red'}`}>{trial?.balanced ? 'Yes' : 'No'}</span>
            </div>
          </div>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Debit</th><th className="num">Credit</th></tr>
              </thead>
              <tbody>
                {(trial?.lines || []).map((line: any) => (
                  <tr key={line.code}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{line.code}</td>
                    <td style={{ fontWeight: 600 }}>{line.name}</td>
                    <td><span className="badge badge-gray">{line.type}</span></td>
                    <td className="num">{Number(line.debit).toLocaleString()}</td>
                    <td className="num">{Number(line.credit).toLocaleString()}</td>
                  </tr>
                ))}
                {(!trial?.lines || trial.lines.length === 0) && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--neutral-500)' }}>No ledger entries in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── Receivables ────────────────────────────

function ReceivablesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ invoiceNumber: '', amount: '', dueDate: '', buyerId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    accountingApi.receivables().then((res) => setInvoices(res.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const daysUntil = (dueDate: string) => Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await accountingApi.createInvoice({
        invoiceNumber: form.invoiceNumber,
        amount: Number(form.amount),
        dueDate: form.dueDate,
        buyerId: form.buyerId || undefined,
      });
      setShowForm(false);
      setForm({ invoiceNumber: '', amount: '', dueDate: '', buyerId: '' });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create invoice.');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New invoice</button>
      </div>

      {showForm && (
        <Modal
          title="New invoice"
          onClose={() => setShowForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create invoice'}</button>
          </>}
        >
          <form onSubmit={submit} style={{ display: 'grid', gap: 9 }}>
            <input className="input-field" placeholder="Invoice number" required value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
            <input className="input-field" type="number" min="0.01" step="0.01" placeholder="Amount (TZS)" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input className="input-field" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <input className="input-field" placeholder="Buyer ID (optional)" value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })} />
            {error && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
          </form>
        </Modal>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>No open invoices.</div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Invoice</th><th>Buyer</th><th className="num">Amount</th><th>Due</th><th>Status</th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const days = daysUntil(inv.dueDate);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.invoiceNumber}</td>
                    <td>{inv.buyer?.name || '—'}</td>
                    <td className="num">{Number(inv.amount).toLocaleString()} TZS</td>
                    <td style={{ fontSize: 12 }}>
                      {new Date(inv.dueDate).toLocaleDateString()}
                      <div style={{ color: days < 0 ? 'var(--red-400)' : 'var(--neutral-500)' }}>
                        {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                      </div>
                    </td>
                    <td>{invoiceStatusBadge(inv.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Payables ────────────────────────────

function PayablesTab() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ billNumber: '', supplierId: '', supplier: '', amount: '', dueDate: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    accountingApi.payables().then((res) => setBills(res.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    suppliersApi.getAll().then((res) => setSuppliers(res.data?.data || res.data || [])).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const supplierName = suppliers.find((s) => s.id === form.supplierId)?.name || form.supplier;
      await accountingApi.createBill({
        billNumber: form.billNumber,
        supplier: supplierName || 'Unknown supplier',
        supplierId: form.supplierId || undefined,
        amount: Number(form.amount),
        dueDate: form.dueDate,
        description: form.description || undefined,
      });
      setShowForm(false);
      setForm({ billNumber: '', supplierId: '', supplier: '', amount: '', dueDate: '', description: '' });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create bill.');
    } finally { setSaving(false); }
  };

  const pay = async (id: string) => {
    setPayingId(id);
    try {
      await accountingApi.payBill(id);
      load();
    } catch (err) {
      console.error(err);
    } finally { setPayingId(null); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New bill</button>
      </div>

      {showForm && (
        <Modal
          title="New bill"
          onClose={() => setShowForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create bill'}</button>
          </>}
        >
          <form onSubmit={submit} style={{ display: 'grid', gap: 9 }}>
            <input className="input-field" placeholder="Bill number" required value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} />
            <select className="input-field" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!form.supplierId && (
              <input className="input-field" placeholder="Or type supplier name" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            )}
            <input className="input-field" type="number" min="0.01" step="0.01" placeholder="Amount (TZS)" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input className="input-field" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <input className="input-field" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            {error && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
          </form>
        </Modal>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading bills…</div>
      ) : bills.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>No open bills.</div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Bill</th><th>Supplier</th><th className="num">Amount</th><th>Due</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{bill.billNumber}</td>
                  <td>{bill.supplierRef?.name || bill.supplier}</td>
                  <td className="num">{Number(bill.amount).toLocaleString()} TZS</td>
                  <td style={{ fontSize: 12 }}>{new Date(bill.dueDate).toLocaleDateString()}</td>
                  <td>{invoiceStatusBadge(bill.status)}</td>
                  <td>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} disabled={payingId === bill.id} onClick={() => pay(bill.id)}>
                      {payingId === bill.id ? '…' : 'Pay'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Budgets ────────────────────────────

function BudgetsTab() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', fiscalYear: '', seasonLabel: '', startDate: '', endDate: '' });
  const [lines, setLines] = useState<{ accountId: string; amount: string }[]>([{ accountId: '', amount: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Budget | null>(null);

  const load = () => {
    setLoading(true);
    accountingApi.listBudgets().then((res) => setBudgets(res.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    accountingApi.accounts().then((res) => setAccounts(res.data || [])).catch(() => {});
  }, []);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    try {
      const res = await accountingApi.budgetActual(id);
      setDetail(res.data);
    } catch (e) { console.error(e); }
  };

  const updateLine = (i: number, field: 'accountId' | 'amount', value: string) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await accountingApi.createBudget({
        name: form.name,
        fiscalYear: form.fiscalYear ? Number(form.fiscalYear) : undefined,
        seasonLabel: form.seasonLabel || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        lines: lines.filter((l) => l.accountId && l.amount).map((l) => ({ accountId: l.accountId, amount: Number(l.amount) })),
      });
      setShowForm(false);
      setForm({ name: '', fiscalYear: '', seasonLabel: '', startDate: '', endDate: '' });
      setLines([{ accountId: '', amount: '' }]);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create budget.');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New budget</button>
      </div>

      {showForm && (
        <Modal
          title="New budget"
          onClose={() => setShowForm(false)}
          width="560px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create budget'}</button>
          </>}
        >
          <form onSubmit={submit} style={{ display: 'grid', gap: 9 }}>
            <input className="input-field" placeholder="Budget name (e.g. 2026 Annual Budget)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <input className="input-field" type="number" placeholder="Fiscal year" value={form.fiscalYear} onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })} />
              <input className="input-field" placeholder="Season label (optional)" value={form.seasonLabel} onChange={(e) => setForm({ ...form, seasonLabel: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <input className="input-field" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              <input className="input-field" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', marginTop: 8 }}>Budget lines</div>
            {lines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8 }}>
                <select className="input-field" value={line.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <input className="input-field" type="number" placeholder="Amount" value={line.amount} onChange={(e) => updateLine(i, 'amount', e.target.value)} />
              </div>
            ))}
            <button type="button" className="btn-secondary" style={{ fontSize: 12, justifySelf: 'start' }} onClick={() => setLines([...lines, { accountId: '', amount: '' }])}>+ Add line</button>
            {error && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
          </form>
        </Modal>
      )}

      {detailId && (
        <Modal title="Budget vs actual" onClose={() => setDetailId(null)} width="560px" footer={<button className="btn-secondary" onClick={() => setDetailId(null)}>Close</button>}>
          {!detail ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Account</th><th className="num">Budgeted</th><th className="num">Actual</th><th className="num">Variance</th></tr></thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.account?.name}</td>
                    <td className="num">{Number(l.amount).toLocaleString()}</td>
                    <td className="num">{Number(l.actual || 0).toLocaleString()}</td>
                    <td className="num" style={{ color: (l.variance ?? 0) < 0 ? 'var(--red-400)' : 'var(--green-400)' }}>
                      {Number(l.variance || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading budgets…</div>
      ) : budgets.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>No budgets yet.</div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Budget</th><th>Period</th><th className="num">Lines</th><th></th></tr></thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.name}{b.fiscalYear ? ` (${b.fiscalYear})` : ''}</td>
                  <td style={{ fontSize: 12 }}>{new Date(b.startDate).toLocaleDateString()} — {new Date(b.endDate).toLocaleDateString()}</td>
                  <td className="num">{b.lines?.length ?? 0}</td>
                  <td><button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => openDetail(b.id)}>View actuals</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Loans & Lenders ────────────────────────────

function LoansTab() {
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contactPerson: '', contactPhone: '', payoutPhone: '', payoutName: '', interestRatePercent: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([loansApi.lenders.getAll(), loansApi.getAll()])
      .then(([lendersRes, loansRes]) => {
        setLenders(lendersRes.data || []);
        setLoans(loansRes.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await loansApi.lenders.create({
        name: form.name,
        contactPerson: form.contactPerson || undefined,
        contactPhone: form.contactPhone || undefined,
        payoutPhone: form.payoutPhone || undefined,
        payoutName: form.payoutName || undefined,
        interestRatePercent: form.interestRatePercent ? Number(form.interestRatePercent) : undefined,
      });
      setShowForm(false);
      setForm({ name: '', contactPerson: '', contactPhone: '', payoutPhone: '', payoutName: '', interestRatePercent: '' });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create lender.');
    } finally { setSaving(false); }
  };

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await loansApi.payoutReport({ format: 'csv' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lender-payouts.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally { setDownloading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <button className="btn-secondary" onClick={downloadReport} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download lender payout report'}
        </button>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New lender</button>
      </div>

      {showForm && (
        <Modal
          title="New lender"
          subtitle="Financial service providers whose farmer loans are deducted from rice sale payments."
          onClose={() => setShowForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create lender'}</button>
          </>}
        >
          <form onSubmit={submit} style={{ display: 'grid', gap: 9 }}>
            <input className="input-field" placeholder="Lender name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input-field" placeholder="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <input className="input-field" placeholder="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <input className="input-field" placeholder="Payout phone (mobile money)" value={form.payoutPhone} onChange={(e) => setForm({ ...form, payoutPhone: e.target.value })} />
            <input className="input-field" placeholder="Payout account name" value={form.payoutName} onChange={(e) => setForm({ ...form, payoutName: e.target.value })} />
            <input className="input-field" type="number" step="0.01" placeholder="Interest rate % (optional)" value={form.interestRatePercent} onChange={(e) => setForm({ ...form, interestRatePercent: e.target.value })} />
            {error && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
          </form>
        </Modal>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
      ) : (
        <>
          <div className="table-panel" style={{ marginBottom: 20 }}>
            <div className="section-toolbar"><strong>Lender directory</strong><span className="muted">{lenders.length} lender(s)</span></div>
            {lenders.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--neutral-500)' }}>No lenders yet.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Lender</th><th>Contact</th><th>Payout</th><th className="num">Interest %</th><th className="num">Loans</th></tr></thead>
                <tbody>
                  {lenders.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.name}</td>
                      <td style={{ fontSize: 12 }}>{l.contactPerson || '—'} {l.contactPhone ? `· ${l.contactPhone}` : ''}</td>
                      <td style={{ fontSize: 12 }}>{l.payoutName || '—'} {l.payoutPhone ? `· ${l.payoutPhone}` : ''}</td>
                      <td className="num">{l.interestRatePercent ?? '—'}</td>
                      <td className="num">{l._count?.loans ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="table-panel">
            <div className="section-toolbar"><strong>Loan records</strong><span className="muted">{loans.length} loan(s)</span></div>
            {loans.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--neutral-500)' }}>No loans recorded yet.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Farmer</th><th>Lender</th><th className="num">Original</th><th className="num">Owed</th><th className="num">Auto-deduct %</th><th>Status</th></tr></thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.id}>
                      <td>{loan.farmer ? `${loan.farmer.firstName} ${loan.farmer.lastName}` : '—'}</td>
                      <td>{loan.lender?.name || loan.lenderName}</td>
                      <td className="num">{Number(loan.originalAmount).toLocaleString()}</td>
                      <td className="num">{Number(loan.amountOwed).toLocaleString()}</td>
                      <td className="num">{loan.autoDeductPercent ?? '—'}</td>
                      <td><span className={`badge ${loan.isActive ? 'badge-green' : 'badge-gray'}`}>{loan.isActive ? 'Active' : 'Closed'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
