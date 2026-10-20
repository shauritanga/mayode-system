'use client';
import Link from 'next/link';
import { integrationsApi } from '@/lib/api';
import { useLoad, ErrorNote, Loading, Empty } from '@/components/ops/ui';
import { ChartCard, DonutBreakdown, HorizontalBarChart, TrendAreaChart } from '@/components/role-dashboards/Charts';
import { EmptyState, MetricTile, money } from '@/components/role-dashboards/DashboardPrimitives';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
const tons = (kg: number) => `${(Math.round((kg || 0) / 100) / 10).toLocaleString()} t`;
const num = (n: number) => (n || 0).toLocaleString();
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

const SEVERITY_TONE: Record<string, string> = { HIGH: 'badge-gold', MEDIUM: 'badge-blue', LOW: 'badge-green' };

interface Overview {
  generatedAt: string;
  months: string[];
  kpis: { farmers: number; farms: number; hectares: number; harvestKg: number; yieldKgPerHa: number | null };
  harvestSeries: { month: string; actualKg: number; estimatedKg: number }[];
  cropStages: { status: string; count: number }[];
  advisories: {
    severity: { HIGH: number; MEDIUM: number; LOW: number };
    latest: { id: string; sourceType: string; farmCode: string | null; capturedAt: string; summary: string; severity: string }[];
  };
  attention: { overdueHarvests: number; unverifiedFarms: number; highAdvisories: number; overdueInvoices?: number };
  stock?: { totalKg: number; byWarehouse: { warehouse: string; kg: number }[] };
  sales?: {
    series: { month: string; invoicedTzs: number; collectedTzs: number }[];
    invoicedTzs: number;
    collectedTzs: number;
    outstandingTzs: number;
    overdue: number;
  };
}

/** Read-only roll-up of harvest, yield, stock, sales and advisories; stock and sales appear only when the API sends them. */
export default function InsightsOverview() {
  const { data, error, loading } = useLoad<Overview>(() => integrationsApi.insights());
  if (loading && !data) return <Loading text="Loading insights…" />;
  if (!data) return <ErrorNote message={error || 'Could not load insights.'} />;

  const { kpis, attention } = data;
  const harvest = data.harvestSeries.map((m) => ({
    month: monthLabel(m.month),
    Actual: Math.round(m.actualKg / 100) / 10,
    Estimated: Math.round(m.estimatedKg / 100) / 10,
  }));
  const sales = data.sales?.series.map((m) => ({
    month: monthLabel(m.month),
    Invoiced: Math.round(m.invoicedTzs / 100_000) / 10,
    Collected: Math.round(m.collectedTzs / 100_000) / 10,
  }));
  const severity = data.advisories.severity;
  const attentionItems = [
    attention.overdueHarvests > 0 && { text: `${num(attention.overdueHarvests)} crop cycle(s) are past their expected harvest date`, href: '/dashboard/crop-cycles' },
    attention.highAdvisories > 0 && { text: `${num(attention.highAdvisories)} high-severity advisory(ies) in the last 90 days`, href: null },
    attention.unverifiedFarms > 0 && { text: `${num(attention.unverifiedFarms)} farm(s) not yet verified`, href: '/dashboard/farms' },
    (attention.overdueInvoices ?? 0) > 0 && { text: `${num(attention.overdueInvoices!)} invoice(s) are past their due date`, href: '/dashboard/ops-orders' },
  ].filter(Boolean) as { text: string; href: string | null }[];

  return (
    <section className="role-dashboard" aria-label="AI insights overview">
      <ErrorNote message={error} />
      <div className="role-grid">
        <MetricTile label="Farmers" value={num(kpis.farmers)} hint={`${num(kpis.farms)} farms`} />
        <MetricTile label="Land registered" value={`${num(kpis.hectares)} ha`} hint="Social hectares" tone="blue" />
        <MetricTile label="Harvested, last 12 months" value={tons(kpis.harvestKg)} hint="Recorded harvests" tone="gold" />
        <MetricTile
          label="Average yield"
          value={kpis.yieldKgPerHa == null ? '—' : `${num(kpis.yieldKgPerHa)} kg/ha`}
          hint="Harvested cycles with a planted area"
          tone="purple"
        />
        {data.stock && <MetricTile label="Rice in stock" value={tons(data.stock.totalKg)} hint={`${data.stock.byWarehouse.length} warehouse(s)`} />}
        {data.sales && <MetricTile label="Invoiced, last 12 months" value={money(data.sales.invoicedTzs)} hint={`${money(data.sales.outstandingTzs)} outstanding`} tone="blue" />}
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Harvest: estimated against actual" subtitle="Tons harvested per month">
          <TrendAreaChart
            data={harvest}
            xKey="month"
            series={[
              { key: 'Estimated', label: 'Estimated', color: 'var(--gold-400)' },
              { key: 'Actual', label: 'Actual', color: 'var(--green-500)' },
            ]}
          />
        </ChartCard>
        {sales ? (
          <ChartCard title="Sales and collections" subtitle="TZS millions per month">
            <TrendAreaChart
              data={sales}
              xKey="month"
              series={[
                { key: 'Invoiced', label: 'Invoiced', color: 'var(--blue-500)' },
                { key: 'Collected', label: 'Collected', color: 'var(--green-500)' },
              ]}
            />
          </ChartCard>
        ) : (
          <ChartCard title="Crop cycles by stage" subtitle="All crop cycles">
            <DonutBreakdown data={data.cropStages.map((s) => ({ name: label(s.status), value: s.count }))} />
          </ChartCard>
        )}
      </div>

      <div className="role-two-col-even">
        {sales && (
          <ChartCard title="Crop cycles by stage" subtitle="All crop cycles">
            <DonutBreakdown data={data.cropStages.map((s) => ({ name: label(s.status), value: s.count }))} />
          </ChartCard>
        )}
        <ChartCard title="Advisories by severity" subtitle="Last 90 days">
          <DonutBreakdown
            data={[
              { name: 'High', value: severity.HIGH },
              { name: 'Medium', value: severity.MEDIUM },
              { name: 'Low', value: severity.LOW },
            ]}
          />
        </ChartCard>
        {data.stock && (
          <ChartCard title="Stock by warehouse" subtitle="Tons on hand">
            <HorizontalBarChart
              data={data.stock.byWarehouse.map((w) => ({ name: w.warehouse, value: Math.round(w.kg / 100) / 10 }))}
              height={Math.max(220, data.stock.byWarehouse.length * 38)}
            />
          </ChartCard>
        )}
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Needs attention" subtitle="Worked out from live records">
          {attentionItems.length === 0 ? (
            <EmptyState>Nothing needs attention right now.</EmptyState>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {attentionItems.map((a) => (
                <li key={a.text} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span>{a.text}</span>
                  {a.href && <Link href={a.href}>Open →</Link>}
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Latest advisories" subtitle="From soil, drone, sorter and field checks">
          {data.advisories.latest.length === 0 ? (
            <Empty>No advisories yet. Generate one from the Advisory and intake tab.</Empty>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {data.advisories.latest.map((a) => (
                <li key={a.id} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${SEVERITY_TONE[a.severity] || 'badge-green'}`}>{label(a.severity)}</span>
                    <strong style={{ fontSize: 13 }}>{label(a.sourceType)}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {a.farmCode ? `${a.farmCode} · ` : ''}
                      {new Date(a.capturedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span style={{ fontSize: 13 }}>{a.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
