'use client';
import { useState } from 'react';
import { EmptyState, InsightPanel, MetricTile, money } from '@/components/role-dashboards/DashboardPrimitives';
import { financeApi } from '@/lib/api';
import { downloadCsv } from '@/lib/download';
import { CostForm, RevenueForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerFinancePage() {
  const { profile, farms, cycleOptions, run, loading } = useFarmerData();
  const [farmId, setFarmId] = useState(''); const [season, setSeason] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const finance = profile?.finance;
  const allCycles = profile?.production?.cycles ?? [];
  const cycles = allCycles.filter((c: any) => (!farmId || c.farmId === farmId) && (!season || c.season === season));
  const payments = (profile?.recentPayments ?? []).filter((p: any) => {
    const date = (p.paidAt || p.createdAt).slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });
  if (loading && !profile) return <p>Loading your financial history…</p>;
  return <div className="page-shell">
    <div><h1 className="page-title">My finances</h1><p className="page-subtitle">Production costs, sales, payment clearance, loans and premium contributions.</p></div>
    <div className="role-grid">
      <MetricTile label="Net farm income" value={finance ? money(finance.netProfit) : '—'} hint="Recorded revenue and premium less costs" />
      <MetricTile label="Payments received" value={finance ? money(finance.paidAmount) : '—'} hint="Cleared rice purchase payments" />
      <MetricTile label="Payments outstanding" value={finance ? money(finance.outstandingPayments) : '—'} hint="Pending or failed rice purchase payouts" tone="gold" />
      <MetricTile label="Outstanding loans" value={finance ? money(finance.totalLoanOutstanding) : '—'} tone="red" />
      <MetricTile label="Premium contribution" value={finance ? money(finance.premiumContribution) : '—'} hint="Your share allocated from cooperative sales" tone="purple" />
    </div>
    <InsightPanel title="Production and profitability by season">
      <div className="form-grid"><label className="form-label">Farm<select className="input-field" value={farmId} onChange={(e) => setFarmId(e.target.value)}><option value="">All my farms</option>{farms.map((f) => <option key={f.id} value={f.id}>{f.farmCode}</option>)}</select></label><label className="form-label">Season<select className="input-field" value={season} onChange={(e) => setSeason(e.target.value)}><option value="">All seasons</option>{Array.from(new Set<string>(allCycles.map((c: any) => c.season))).map((s) => <option key={s}>{s}</option>)}</select></label><button className="btn-secondary" disabled={!cycles.length} onClick={() => downloadCsv('my-production-history.csv', cycles)}>Export production CSV</button></div>
      <div className="table-wrap"><table><thead><tr><th>Farm / season</th><th>Yield kg</th><th>Costs</th><th>Revenue + premium</th><th>Profit</th><th>Margin</th><th>Profit / ha</th></tr></thead><tbody>{cycles.map((c: any) => <tr key={c.id}><td>{c.farmCode} · {c.season}<small style={{ display: 'block' }}>{c.riceVariety} · {c.status}</small></td><td>{c.actualYieldKg ?? '—'}</td><td>{money(c.totalCosts)}</td><td>{money(c.totalRevenue)}</td><td>{money(c.netProfit)}</td><td>{c.profitMargin == null ? '—' : `${c.profitMargin.toFixed(1)}%`}</td><td>{c.profitPerHectare == null ? '—' : money(c.profitPerHectare)}</td></tr>)}</tbody></table></div>{!cycles.length && <EmptyState>No production records match these filters.</EmptyState>}
    </InsightPanel>
    <InsightPanel title="Payment history" subtitle="Payments are separate from recorded sales; pending amounts are not treated as money received.">
      <div className="form-grid"><label className="form-label">From<input type="date" className="input-field" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label><label className="form-label">To<input type="date" className="input-field" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label><button className="btn-secondary" disabled={!payments.length} onClick={() => downloadCsv('my-payments.csv', payments.map((p: any) => ({ date: p.paidAt || p.createdAt, type: p.paymentType, gross: p.amount, loanDeduction: p.loanDeduction, net: p.netAmount ?? p.amount, status: p.status, description: p.description })))}>Export payments CSV</button></div>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Payment</th><th>Gross</th><th>Loan deduction</th><th>Net</th><th>Status</th></tr></thead><tbody>{payments.map((p: any) => <tr key={p.id}><td>{(p.paidAt || p.createdAt).slice(0, 10)}</td><td>{p.description || p.paymentType}</td><td>{money(p.amount)}</td><td>{money(p.loanDeduction)}</td><td>{money(p.netAmount ?? p.amount)}</td><td>{p.status}</td></tr>)}</tbody></table></div>{!payments.length && <EmptyState>No payments in this period.</EmptyState>}
    </InsightPanel>
    <div className="role-two-col"><InsightPanel title="Loans and repayments"><div className="role-list">{(profile?.loans ?? []).map((loan: any) => <div className="role-list-item" key={loan.id}><div><strong>{loan.lenderName}</strong><p>Original {money(loan.originalAmount)} · Outstanding {money(loan.amountOwed)}</p><p>{loan.deductions.length} recorded repayments · {loan.isActive ? 'Active' : 'Closed'}</p></div></div>)}{!profile?.loans?.length && <EmptyState>No recorded loans.</EmptyState>}</div></InsightPanel>
    <InsightPanel title="My Fairtrade Premium contribution"><div className="role-list">{(profile?.contributions ?? []).map((c: any) => <div className="role-list-item" key={c.id}><div><strong>{c.sale.invoiceNumber}</strong><p>{c.quantityKg} kg · {c.sale.saleDate.slice(0, 10)} · Buyer {c.sale.paymentReceived ? 'paid' : 'payment pending'}</p></div><strong>{money(c.fairtradePremium)}</strong></div>)}{!profile?.contributions?.length && <EmptyState>No cooperative sale allocations yet.</EmptyState>}</div></InsightPanel></div>
    <div className="role-two-col"><CostForm cycles={cycleOptions} onSubmit={(payload) => run(() => financeApi.addCost(payload), 'Expense recorded.')} /><RevenueForm cycles={cycleOptions} onSubmit={(payload) => run(() => financeApi.addRevenue(payload), 'Revenue recorded.')} /></div>
  </div>;
}
