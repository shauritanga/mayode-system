'use client';
import { InsightPanel, MetricTile, money } from '@/components/role-dashboards/DashboardPrimitives';
import { financeApi } from '@/lib/api';
import { CostForm, RevenueForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerFinancePage() {
  const { profile, cycleOptions, run } = useFarmerData();
  const finance = profile?.finance;
  const payments = profile?.recentPayments || [];

  return <div className="role-two-col">
    <InsightPanel title="Payments, loans and profit" subtitle="Farmer financial position from recorded production.">
      <div className="role-grid">
        <MetricTile label="Revenue" value={money(finance?.totalRevenue)} hint="Recorded crop revenue" />
        <MetricTile label="Costs" value={money(finance?.totalCosts)} hint="Input/labor/other costs" tone="gold" />
        <MetricTile label="Outstanding loans" value={money(finance?.totalLoanOutstanding)} hint={`${finance?.activeLoanCount || 0} active loans`} tone="red" />
      </div>
      <div className="role-list" style={{ marginTop: 14 }}>
        {payments.slice(0, 8).map((payment: any) => <div className="role-list-item" key={payment.id}><div><strong>{money(payment.netAmount ?? payment.amount)}</strong><p>Deduction {money(payment.loanDeduction)} · {payment.status}</p></div><small>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : 'Pending'}</small></div>)}
      </div>
    </InsightPanel>
    <CostForm cycles={cycleOptions} onSubmit={(payload) => run(() => financeApi.addCost(payload), 'Expense recorded.')} />
    <RevenueForm cycles={cycleOptions} onSubmit={(payload) => run(() => financeApi.addRevenue(payload), 'Revenue recorded.')} />
  </div>;
}
