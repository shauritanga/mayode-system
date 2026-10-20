'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Building03Icon,
  Calendar01Icon,
  Female02Icon,
  Layers01Icon,
  Leaf01Icon,
  MapsIcon,
  Male02Icon,
  Money01Icon,
  PackageIcon,
  Plant01Icon,
  Shield01Icon,
  UserGroupIcon,
  UserIcon,
  UserMultiple02Icon,
  WheatIcon,
} from '@hugeicons/core-free-icons';
import { reportsApi } from '@/lib/api';
import {
  CHART_PALETTE,
  ChartCard,
  ChartEmptyState,
  DonutBreakdown,
  HorizontalBarChart,
} from '@/components/role-dashboards/Charts';
import {
  EmptyState,
  StatCard,
  StatCardSkeleton,
  ChartSkeleton,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';

const tooltipStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontSize: 13,
};
const axisTick = { fill: 'var(--neutral-500)', fontSize: 12 };

const tons = (kg: number) => `${Math.round((kg || 0) / 1000).toLocaleString()} t`;
const num = (n: number) => (n || 0).toLocaleString();
const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}% of farmers` : 'No farmers yet';
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function GroupedBars({
  data,
  xKey,
  series,
  height = 260,
}: {
  data: Record<string, any>[];
  xKey: string;
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  if (!data.length) return <ChartEmptyState>No data yet.</ChartEmptyState>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={54} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover-tint-2)' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** The dashboard shows this in two places (headline tiles, then the rest), so share one request between them. */
let overviewRequest: Promise<any> | null = null;
function loadOverview() {
  if (!overviewRequest) {
    overviewRequest = reportsApi.riceOverview().then((res) => res.data);
    overviewRequest.catch(() => { overviewRequest = null; });
  }
  return overviewRequest;
}

/** `top` is the first five tiles and the charts; `rest` is the other ten tiles. */
export default function RiceEcosystemOverview({ part = 'all' }: { part?: 'all' | 'top' | 'rest' }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOverview()
      .then(setData)
      .catch(() => setError('Unable to load the rice ecosystem overview.'));
  }, []);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) {
    return (
      <div className="role-dashboard">
        {[...Array(part === 'rest' ? 10 : 5)].map((_, i) => <StatCardSkeleton key={i} />)}
        {part !== 'rest' && <ChartSkeleton height={260} />}
      </div>
    );
  }

  const k = data.kpis;
  const c = data.charts;
  const loan = c.loanPerformance;
  const ins = c.insurance;
  const paymentColors: Record<string, string> = {
    PAID: 'var(--green-500)',
    PARTIAL: 'var(--gold-400)',
    PENDING: 'var(--red-400)',
  };

  return (
    <section className="role-dashboard" aria-label="Rice ecosystem overview">

      {part !== 'rest' && (
      <div className="role-grid role-grid-fill">
        <StatCard icon={UserGroupIcon} label="Registered rice farmers" value={num(k.totalFarmers)} hint={`${num(k.verifiedFarmers)} verified`} />
        <StatCard icon={Male02Icon} label="Male farmers" value={num(k.maleFarmers)} hint={pct(k.maleFarmers, k.totalFarmers)} tone="blue" />
        <StatCard icon={Female02Icon} label="Female farmers" value={num(k.femaleFarmers)} hint={pct(k.femaleFarmers, k.totalFarmers)} tone="purple" />
        <StatCard icon={UserIcon} label="Youth farmers" value={num(k.youthFarmers)} hint={`Aged ${k.youthMaxAge} or under`} tone="gold" />
        <StatCard icon={MapsIcon} label="Farms" value={num(k.totalFarms)} hint={`${num(k.verifiedFarms)} verified`} />
      </div>
      )}

      {part !== 'top' && (
      <div className="role-grid role-grid-fill">
        <StatCard icon={Layers01Icon} label="Plots" value={num(k.totalPlots)} hint="Across all farms" tone="blue" />
        <StatCard icon={Plant01Icon} label="Rice area under cultivation" value={`${num(k.riceAreaUnderCultivationHa)} ha`} hint={`of ${num(k.totalHectares)} ha registered`} />
        <StatCard icon={Calendar01Icon} label="Active crop seasons" value={num(k.activeCropSeasons)} hint={`${num(k.activeCropCycles)} active crop cycles`} tone="purple" />
        <StatCard icon={WheatIcon} label="Estimated rice production" value={tons(k.estimatedProductionKg)} hint="Planned + active crop cycles" tone="gold" />
        <StatCard icon={Leaf01Icon} label="Rice harvested" value={tons(k.riceHarvestedKg)} hint="Recorded actual yield" />
        <StatCard icon={PackageIcon} label="Total rice aggregated" value={tons(k.riceAggregatedKg)} hint={`${num(k.aggregationRecords)} intake records`} tone="blue" />
        <StatCard icon={Building03Icon} label="Cooperatives" value={num(k.cooperatives)} hint="Active AMCOS" tone="purple" />
        <StatCard icon={Money01Icon} label="Farmers accessing finance" value={num(k.farmersAccessingFinance)} hint={pct(k.farmersAccessingFinance, k.totalFarmers)} tone="gold" />
        <StatCard icon={Shield01Icon} label="Farmers insured" value={num(k.farmersInsured)} hint={pct(k.farmersInsured, k.totalFarmers)} />
        <StatCard
          icon={UserMultiple02Icon}
          label="Active field officers"
          value={num(k.activeFieldOfficers)}
          hint={`${num(k.fieldOfficersWithRecentVisits)} visited farms in last ${k.fieldOfficerWindowDays} days`}
          tone="blue"
        />
      </div>
      )}

      {part !== 'rest' && (
      <>
      <div className="role-two-col-even">
        <ChartCard title="Farmer registration by district" subtitle="Registered farmers per district">
          <HorizontalBarChart
            data={c.farmersByDistrict.map((r: any) => ({ name: r.district, value: r.count }))}
            height={Math.max(220, c.farmersByDistrict.length * 38)}
          />
        </ChartCard>
        <ChartCard title="Rice area by region" subtitle="Registered farm area in hectares">
          <HorizontalBarChart
            data={c.areaByRegion.map((r: any) => ({ name: r.region, value: r.hectares }))}
            height={Math.max(220, c.areaByRegion.length * 38)}
            color="var(--blue-500)"
          />
        </ChartCard>
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Production forecast by season" subtitle="Estimated vs. actual yield, tons">
          <GroupedBars
            data={c.productionBySeason}
            xKey="season"
            series={[
              { key: 'estimatedTons', name: 'Estimated', color: 'var(--gold-400)' },
              { key: 'actualTons', name: 'Actual', color: 'var(--green-500)' },
            ]}
          />
        </ChartCard>
        <ChartCard title="Rice production by variety" subtitle="Actual yield, or estimate where not yet harvested (tons)">
          <DonutBreakdown data={c.productionByVariety.map((r: any) => ({ name: r.variety, value: r.tons }))} />
        </ChartCard>
      </div>

      <ChartCard title="Crops by growth stage" subtitle="Active and planned rice crops at each of the ten stages">
        <GroupedBars
          data={c.cropsByStage}
          xKey="stage"
          series={[{ key: 'count', name: 'Crops', color: 'var(--green-500)' }]}
          height={280}
        />
      </ChartCard>

      <div className="role-two-col-even">
        <ChartCard title="Farmer gender" subtitle="Share of registered farmers">
          <DonutBreakdown data={c.gender.map((r: any) => ({ name: r.label, value: r.count }))} />
        </ChartCard>
        <ChartCard title="Farmer age distribution" subtitle="Farmers by age band">
          <GroupedBars
            data={c.ageDistribution}
            xKey="label"
            series={[{ key: 'count', name: 'Farmers', color: 'var(--purple-500)' }]}
          />
        </ChartCard>
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Input distribution status" subtitle="Inputs by category and payment status">
          <GroupedBars
            data={c.inputDistribution.byCategory.map((r: any) => ({ ...r, category: label(r.category) }))}
            xKey="category"
            series={[{ key: 'count', name: 'Items distributed', color: 'var(--green-500)' }]}
            height={220}
          />
          <ul className="donut-legend" style={{ marginTop: 12 }}>
            {c.inputDistribution.byPaymentStatus.map((r: any) => (
              <li key={r.status}>
                <span className="donut-legend-dot" style={{ background: paymentColors[r.status] || CHART_PALETTE[0] }} />
                <span className="donut-legend-label">{label(r.status)}</span>
                <span className="donut-legend-value">{num(r.count)} items · {money(r.value)}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard
          title="Loan repayment performance"
          subtitle={`${loan.repaymentRatePct}% repaid · ${money(loan.totalRepaid)} of ${money(loan.totalLent)} · ${num(loan.activeLoans)} of ${num(loan.totalLoans)} loans active`}
        >
          <GroupedBars
            data={loan.byLender}
            xKey="lender"
            series={[
              { key: 'repaid', name: 'Repaid (TZS)', color: 'var(--green-500)' },
              { key: 'owed', name: 'Outstanding (TZS)', color: 'var(--red-400)' },
            ]}
            height={260}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Insurance coverage"
        subtitle={`${ins.coveragePct}% of farmers covered · ${num(ins.insuredHectares)} ha insured · sum insured ${money(ins.totalSumInsured)}`}
      >
        <div className="role-two-col-even">
          <div>
            <h3 className="role-section-label">Policies by status</h3>
            <DonutBreakdown
              data={ins.policiesByStatus.map((r: any) => ({ name: label(r.status), value: r.count }))}
              height={200}
            />
          </div>
          <div>
            <h3 className="role-section-label">Claims by status</h3>
            <GroupedBars
              data={ins.claimsByStatus.map((r: any) => ({ ...r, status: label(r.status) }))}
              xKey="status"
              series={[{ key: 'count', name: 'Claims', color: 'var(--blue-500)' }]}
              height={200}
            />
          </div>
        </div>
      </ChartCard>
      </>
      )}
    </section>
  );
}
