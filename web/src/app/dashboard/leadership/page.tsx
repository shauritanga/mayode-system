'use client';

import { useEffect, useState } from 'react';
import {
  ActionLink,
  EmptyState,
  InsightPanel,
  MetricTile,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import { governanceApi, reportsApi } from '@/lib/api';

export default function LeadershipDashboardPage() {
  const [kpis, setKpis] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [premium, setPremium] = useState<any[]>([]);
  const [governance, setGovernance] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([
      reportsApi.kpis(),
      reportsApi.impact(),
      reportsApi.premiumFund(),
      governanceApi.report(),
    ]).then(([kpiResult, impactResult, premiumResult, governanceResult]) => {
      if (kpiResult.status === 'fulfilled') setKpis(kpiResult.value.data);
      if (impactResult.status === 'fulfilled') setImpact(impactResult.value.data);
      if (premiumResult.status === 'fulfilled') setPremium(premiumResult.value.data || []);
      if (governanceResult.status === 'fulfilled') setGovernance(governanceResult.value.data);
      if (kpiResult.status === 'rejected' && impactResult.status === 'rejected') setError('Unable to load leadership indicators.');
    });
  }, []);

  const latestIncome = impact?.farmerIncomeOverTime?.slice?.(-1)?.[0];

  return <div className="role-dashboard">
    {error && <EmptyState>{error}</EmptyState>}

    <div className="role-grid">
      <MetricTile label="Registered farmers" value={kpis?.totalFarmers ?? '—'} hint="Membership baseline" />
      <MetricTile label="Farm area" value={`${Math.round(kpis?.totalHectares || 0).toLocaleString()} ha`} hint="Mapped production footprint" tone="blue" />
      <MetricTile label="Total yield" value={`${Math.round(kpis?.totalYieldKg || 0).toLocaleString()} kg`} hint="Recorded harvested output" tone="gold" />
      <MetricTile label="Revenue" value={money(kpis?.totalRevenue)} hint="Cooperative revenue recorded" />
      <MetricTile label="Premium fund" value={money(kpis?.premiumFundBalance)} hint="Current Fairtrade fund balance" tone="purple" />
      <MetricTile label="Average income" value={money(impact?.averageFarmerIncome)} hint="Revenue divided by farmers" tone="green" />
    </div>

    <div className="role-two-col">
      <InsightPanel title="Farmer income trend" subtitle="Latest monthly income signal from recorded revenue.">
        {latestIncome ? <div className="role-list">
          <div className="role-list-item">
            <div>
              <strong>{latestIncome.period}</strong>
              <p>{latestIncome.farmerCount} farmers participated</p>
            </div>
            <span>{money(latestIncome.averageFarmerIncome)}</span>
          </div>
          {impact?.farmerIncomeOverTime?.slice(-6).map((row: any) => <div className="role-list-item" key={row.period}>
            <strong>{row.period}</strong>
            <span>{money(row.totalIncome)}</span>
          </div>)}
        </div> : <EmptyState>No farmer income trend yet.</EmptyState>}
      </InsightPanel>

      <InsightPanel title="Premium fund decisions" subtitle="Income and spending entries for member-visible governance.">
        {premium.length ? <div className="role-list">
          {premium.slice(-6).reverse().map((entry) => <div className="role-list-item" key={entry.id}>
            <div>
              <strong>{entry.type}</strong>
              <p>{entry.description}</p>
            </div>
            <span>{money(entry.amount)}</span>
          </div>)}
        </div> : <EmptyState>No premium fund entries recorded.</EmptyState>}
      </InsightPanel>
    </div>

    <div className="role-two-col">
      <InsightPanel title="Governance snapshot" subtitle="Meetings, votes and project records.">
        <div className="role-grid">
          <MetricTile label="Open votes" value={governance?.openVotes?.length ?? '—'} hint="Member decisions in progress" tone="gold" />
          <MetricTile label="Projects" value={governance?.projects?.length ?? impact?.projects?.length ?? '—'} hint="Community/premium projects" tone="purple" />
        </div>
      </InsightPanel>

      <InsightPanel title="Leadership actions" subtitle="Move from dashboard to decision records.">
        <div className="role-list">
          <ActionLink href="/dashboard/compliance" title="Review compliance pack" text="Check audit gaps, traceability and evidence." />
          <ActionLink href="/dashboard/governance" title="Manage governance" text="Record votes, meetings and member decisions." />
          <ActionLink href="/dashboard/projects" title="Track community projects" text="Monitor premium-funded project execution." />
        </div>
      </InsightPanel>
    </div>
  </div>;
}
