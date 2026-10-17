'use client';
import { useEffect, useState } from 'react';
import { marketApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { ChartCard, DonutBreakdown, HorizontalBarChart, TrendAreaChart } from '@/components/role-dashboards/Charts';
import { kg, tzs } from './format';

interface Overview {
  tiles: {
    buyers: number; openOrders: number; riceRequiredKg: number; activeAgreements: number; committedKg: number;
    expiringAgreements: number; soldKg: number; salesValue: number; paidValue: number; receivable: number;
    latestPrice: { commodity: string; price: number; changePct: number | null } | null;
  };
  salesByMonth: { name: string; value: number }[];
  salesByBuyer: { name: string; value: number }[];
  salesByVariety: { name: string; value: number }[];
  ordersByStatus: { name: string; value: number }[];
}

export default function OverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    marketApi.overview({ from: from || undefined, to: to || undefined })
      .then((r) => { setData(r.data as Overview); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load the market overview.')));
  }, [from, to]);

  if (error) return <div className="alert-box alert-danger">{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;
  const t = data.tiles;
  const price = t.latestPrice;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="form-label">Sales from<input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="form-label">to<input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(from || to) && <button className="btn-secondary" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>}
      </div>
      <div className="role-grid" style={{ marginBottom: 16 }}>
        <MetricTile label="Buyers" value={t.buyers} hint={`${t.activeAgreements} with an active agreement`} tone="blue" />
        <MetricTile label="Open buyer orders" value={t.openOrders} hint={`${kg(t.riceRequiredKg)} still required`} tone="gold" />
        <MetricTile label="Active agreements" value={t.activeAgreements} hint={t.expiringAgreements ? `${t.expiringAgreements} end within 30 days` : `${kg(t.committedKg)} still to deliver`} tone={t.expiringAgreements ? 'red' : 'purple'} />
        <MetricTile label="Rice sold" value={kg(t.soldKg)} hint="In the selected period" tone="green" />
        <MetricTile label="Sales value" value={tzs(t.salesValue)} hint={`${tzs(t.paidValue)} received`} tone="green" />
        <MetricTile label="Payments awaited" value={tzs(t.receivable)} hint="Invoiced, not yet paid" tone={t.receivable > 0 ? 'gold' : 'green'} />
        <MetricTile
          label="Latest market price"
          value={price ? tzs(price.price) : '—'}
          hint={price ? `${price.commodity}${price.changePct != null ? ` · ${price.changePct > 0 ? '+' : ''}${price.changePct}%` : ''}` : 'No prices recorded'}
          tone="purple"
        />
      </div>
      <div className="role-two-col">
        <ChartCard title="Sales by month" subtitle="Invoice value per month (TZS).">
          <TrendAreaChart data={data.salesByMonth} xKey="name" series={[{ key: 'value', label: 'Sales value', color: 'var(--green-500)' }]} />
        </ChartCard>
        <ChartCard title="Top buyers" subtitle="By sales value (TZS).">
          <HorizontalBarChart data={data.salesByBuyer} color="var(--blue-500)" />
        </ChartCard>
        <ChartCard title="Rice sold by variety" subtitle="Kilograms.">
          <DonutBreakdown data={data.salesByVariety} />
        </ChartCard>
        <ChartCard title="Buyer orders by status">
          <HorizontalBarChart data={data.ordersByStatus.map((o) => ({ name: o.name.replace(/_/g, ' '), value: o.value }))} color="var(--gold-400)" />
        </ChartCard>
      </div>
    </div>
  );
}
