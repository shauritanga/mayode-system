'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionLink,
  EmptyState,
  InsightPanel,
  MetricTile,
  RoleHero,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import {
  ChartCard,
  DonutBreakdown,
  HorizontalBarChart,
  LeaderboardTable,
  TrendAreaChart,
} from '@/components/role-dashboards/Charts';
import { cropCyclesApi, farmersApi, farmsApi, farmVerificationsApi, fieldOfficerVisitsApi, financeApi, insuranceApi, integrationsApi, inventoryApi, loansApi, mamcosApi, reportsApi, usersApi } from '@/lib/api';

export default function AdminOverviewDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [mamcos, setMamcos] = useState<any[]>([]);
  const [cropCycles, setCropCycles] = useState<any[]>([]);
  const [inventoryRecords, setInventoryRecords] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [inputCosts, setInputCosts] = useState<any[]>([]);
  const [officerVisits, setOfficerVisits] = useState<any[]>([]);
  const [farmVerifications, setFarmVerifications] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [insuranceCoverage, setInsuranceCoverage] = useState<any>(null);
  const [kpis, setKpis] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([
      usersApi.getAll(),
      farmersApi.getAllUnpaginated(),
      farmsApi.getAll(),
      mamcosApi.getAll(),
      cropCyclesApi.getAll(),
      inventoryApi.getAll(),
      loansApi.getAll(),
      financeApi.getAllCosts(),
      fieldOfficerVisitsApi.getAll(),
      farmVerificationsApi.getAll(),
      cropCyclesApi.activityLogs(),
      insuranceApi.coverageSummary(),
      reportsApi.kpis(),
      reportsApi.impact(),
      integrationsApi.aiRecords(),
    ]).then(([userResult, farmerResult, farmResult, mamcosResult, cropCycleResult, inventoryResult, loanResult, inputCostResult, visitResult, farmVerificationResult, activityLogResult, insuranceResult, kpiResult, impactResult, integrationResult]) => {
      if (userResult.status === 'fulfilled') setUsers(userResult.value.data || []);
      if (farmerResult.status === 'fulfilled') setFarmers(farmerResult.value.data || []);
      if (farmResult.status === 'fulfilled') setFarms(farmResult.value.data?.data || farmResult.value.data || []);
      if (mamcosResult.status === 'fulfilled') setMamcos(mamcosResult.value.data || []);
      if (cropCycleResult.status === 'fulfilled') setCropCycles(cropCycleResult.value.data || []);
      if (inventoryResult.status === 'fulfilled') setInventoryRecords(inventoryResult.value.data || []);
      if (loanResult.status === 'fulfilled') setLoans(loanResult.value.data || []);
      if (inputCostResult.status === 'fulfilled') setInputCosts(inputCostResult.value.data || []);
      if (visitResult.status === 'fulfilled') setOfficerVisits(visitResult.value.data || []);
      if (farmVerificationResult.status === 'fulfilled') setFarmVerifications(farmVerificationResult.value.data || []);
      if (activityLogResult.status === 'fulfilled') setActivityLogs(activityLogResult.value.data || []);
      if (insuranceResult.status === 'fulfilled') setInsuranceCoverage(insuranceResult.value.data);
      if (kpiResult.status === 'fulfilled') setKpis(kpiResult.value.data);
      if (impactResult.status === 'fulfilled') setImpact(impactResult.value.data);
      if (integrationResult.status === 'fulfilled') setIntegrations(integrationResult.value.data || []);
      if (userResult.status === 'rejected' && farmerResult.status === 'rejected') setError('Unable to load MAYOData administration data.');
    });
  }, []);

  const roles = useMemo(() => {
    return users.reduce<Record<string, number>>((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
  }, [users]);

  const roleChartData = useMemo(
    () =>
      Object.entries(roles)
        .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
        .sort((a, b) => b.value - a.value),
    [roles],
  );

  const genderChartData = useMemo(() => {
    const counts = farmers.reduce<Record<string, number>>((acc, farmer) => {
      const label = farmer.gender ? String(farmer.gender) : 'Unspecified';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [farmers]);

  const districtChartData = useMemo(() => {
    const counts = farmers.reduce<Record<string, number>>((acc, farmer) => {
      const label = farmer.district || 'Unspecified';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [farmers]);

  // Tanzania's national youth definition caps at 35 years old.
  const YOUTH_MAX_AGE = 35;
  const ageChartData = useMemo(() => {
    const counts = farmers.reduce<Record<string, number>>((acc, farmer) => {
      if (!farmer.dateOfBirth) {
        acc['Unspecified'] = (acc['Unspecified'] || 0) + 1;
        return acc;
      }
      const age = Math.floor(
        (Date.now() - new Date(farmer.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
      const label = age <= YOUTH_MAX_AGE ? 'Youth (≤35)' : 'Adult (36+)';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [farmers]);

  const regionChartData = useMemo(() => {
    const totals = farms.reduce<Record<string, number>>((acc, farm) => {
      const label = farm.region || 'Unspecified';
      acc[label] = (acc[label] || 0) + (farm.socialHectares || 0);
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [farms]);

  const incomeTrendData = useMemo(
    () =>
      (impact?.farmerIncomeOverTime || []).map((row: any) => ({
        period: row.period,
        totalIncome: Math.round(row.totalIncome),
      })),
    [impact],
  );

  const membershipTrendData = useMemo(
    () =>
      (impact?.membershipGrowth || []).map((row: any) => ({
        period: row.period,
        cumulativeMembers: row.cumulativeMembers,
      })),
    [impact],
  );

  const varietyChartData = useMemo(() => {
    const totals = cropCycles.reduce<Record<string, number>>((acc, cycle) => {
      const label = cycle.riceVariety || 'Unspecified';
      acc[label] = (acc[label] || 0) + (cycle.actualYieldKg || cycle.estimatedYieldKg || 0);
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [cropCycles]);

  const seasonStatusChartData = useMemo(() => {
    const counts = cropCycles.reduce<Record<string, number>>((acc, cycle) => {
      const label = cycle.status || 'Unspecified';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [cropCycles]);

  const gradeChartData = useMemo(() => {
    const totals = inventoryRecords.reduce<Record<string, number>>((acc, record) => {
      const label = record.qualityGrade || 'Ungraded';
      acc[label] = (acc[label] || 0) + (record.weightKg || 0);
      return acc;
    }, {});
    return Object.entries(totals).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [inventoryRecords]);

  const warehouseStatusChartData = useMemo(() => {
    const totals = inventoryRecords.reduce<Record<string, number>>((acc, record) => {
      const label = record.status || 'Unspecified';
      acc[label] = (acc[label] || 0) + (record.weightKg || 0);
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [inventoryRecords]);

  const totalRiceAggregatedKg = useMemo(
    () => inventoryRecords.reduce((sum, record) => sum + (record.weightKg || 0), 0),
    [inventoryRecords],
  );

  const inputCategoryChartData = useMemo(() => {
    const totals = inputCosts.reduce<Record<string, number>>((acc, cost) => {
      const label = cost.category ? String(cost.category).replace(/_/g, ' ') : 'Unspecified';
      acc[label] = (acc[label] || 0) + (cost.totalCost || 0);
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [inputCosts]);

  const loanRepaymentChartData = useMemo(() => {
    const buckets = loans.reduce<Record<string, number>>((acc, loan) => {
      const owed = loan.amountOwed ?? 0;
      const original = loan.originalAmount ?? 0;
      const label = owed <= 0 ? 'Fully repaid' : owed < original ? 'Partially repaid' : 'Not yet repaid';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [loans]);

  const farmersWithFinance = useMemo(
    () => new Set(loans.filter((loan) => loan.isActive).map((loan) => loan.farmerId)).size,
    [loans],
  );

  const insuranceCoverageChartData = useMemo(() => {
    if (!insuranceCoverage?.byStatus) return [];
    return insuranceCoverage.byStatus.map((row: any) => ({ name: row.status, value: row._count }));
  }, [insuranceCoverage]);

  const claimsCoverageChartData = useMemo(() => {
    if (!insuranceCoverage?.claimsByStatus) return [];
    return insuranceCoverage.claimsByStatus.map((row: any) => ({ name: row.status, value: row._count }));
  }, [insuranceCoverage]);

  // Multi-metric officer leaderboard — ranks officers by farmers verified,
  // farms mapped, visits completed, and crop records updated, using real
  // per-officer foreign keys (FieldOfficerVisit.fieldOfficerId,
  // FarmVerification.fieldOfficerId, ActivityLog.fieldOfficerId,
  // Farmer.verifiedById). "Data completeness" is grounded in
  // FarmVerification.gpsVerified; "last activity" is a proxy for the docx's
  // "last mobile-app sync" since no sync-timestamp field exists in the
  // schema. "Pending tasks" uses the new Farmer.assignedOfficerId field
  // (added this pass) — farmers explicitly assigned to that officer who are
  // still awaiting verification.
  const officerLeaderboard = useMemo(() => {
    const names = new Map<string, string>();
    const visits = new Map<string, number>();
    const farmsMapped = new Map<string, number>();
    const gpsVerifiedCount = new Map<string, number>();
    const activities = new Map<string, number>();
    const farmersVerified = new Map<string, number>();
    const pendingTasks = new Map<string, number>();
    const lastActivity = new Map<string, number>();

    const bump = (map: Map<string, number>, key: string, by = 1) => map.set(key, (map.get(key) || 0) + by);
    const touchLast = (id: string, when?: string) => {
      if (!when) return;
      const t = new Date(when).getTime();
      if (!lastActivity.has(id) || t > (lastActivity.get(id) || 0)) lastActivity.set(id, t);
    };
    const nameFrom = (officer: any) => (officer ? `${officer.firstName} ${officer.lastName}` : undefined);

    for (const visit of officerVisits) {
      const id = visit.fieldOfficerId;
      if (!id) continue;
      if (!names.has(id) && nameFrom(visit.fieldOfficer)) names.set(id, nameFrom(visit.fieldOfficer)!);
      bump(visits, id);
      touchLast(id, visit.visitedAt);
    }
    for (const verification of farmVerifications) {
      const id = verification.fieldOfficerId;
      if (!id) continue;
      if (!names.has(id) && nameFrom(verification.fieldOfficer)) names.set(id, nameFrom(verification.fieldOfficer)!);
      bump(farmsMapped, id);
      if (verification.gpsVerified) bump(gpsVerifiedCount, id);
      touchLast(id, verification.verifiedAt);
    }
    for (const log of activityLogs) {
      const id = log.fieldOfficerId;
      if (!id) continue;
      if (!names.has(id) && nameFrom(log.fieldOfficer)) names.set(id, nameFrom(log.fieldOfficer)!);
      bump(activities, id);
      touchLast(id, log.createdAt);
    }
    for (const farmer of farmers) {
      if (farmer.verifiedById) bump(farmersVerified, farmer.verifiedById);
      if (farmer.assignedOfficerId && farmer.verificationStatus === 'PENDING') {
        bump(pendingTasks, farmer.assignedOfficerId);
      }
    }

    const officerIds = new Set([
      ...visits.keys(),
      ...farmsMapped.keys(),
      ...activities.keys(),
      ...farmersVerified.keys(),
      ...pendingTasks.keys(),
    ]);

    return [...officerIds].map((id) => {
      const mapped = farmsMapped.get(id) || 0;
      const gpsVerified = gpsVerifiedCount.get(id) || 0;
      const totalScore = (visits.get(id) || 0) + mapped + (activities.get(id) || 0) + (farmersVerified.get(id) || 0);
      const last = lastActivity.get(id);
      return {
        id,
        name: names.get(id) || `Officer ${id.slice(0, 8)}`,
        visits: visits.get(id) || 0,
        farmsMapped: mapped,
        farmersVerified: farmersVerified.get(id) || 0,
        activitiesLogged: activities.get(id) || 0,
        pendingTasks: pendingTasks.get(id) || 0,
        gpsVerifiedPct: mapped ? `${Math.round((gpsVerified / mapped) * 100)}%` : '—',
        lastActivity: last ? new Date(last).toLocaleDateString() : '—',
        totalScore,
      };
    });
  }, [officerVisits, farmVerifications, activityLogs, farmers]);

  const unverifiedFarmers = farmers.filter((farmer) => farmer.verificationStatus && farmer.verificationStatus !== 'VERIFIED').length;
  const unverifiedFarms = farms.filter((farm) => !farm.isVerified).length;
  const activeFieldOfficers = roles['FIELD_OFFICER'] || 0;
  const activeSeasons = cropCycles.filter((cycle) => cycle.status === 'ACTIVE' || cycle.status === 'PLANNED').length;

  return <div className="role-dashboard">
    <RoleHero
      eyebrow="Platform administration"
      title="Dashboard"
      subtitle="System-wide control room for users, cooperatives, data quality, integrations, exports and operational health."
    />
    {error && <EmptyState>{error}</EmptyState>}

    {/* Primary KPIs — the numbers a platform admin scans first, ordered by
        the scale of what they represent (people/land → institutions → money). */}
    <div className="role-grid">
      <MetricTile label="Farmers" value={farmers.length || kpis?.totalFarmers || '—'} hint={`${unverifiedFarmers} pending verification`} />
      <MetricTile label="Farms" value={farms.length} hint={`${unverifiedFarms} need verification`} tone="gold" />
      <MetricTile label="Hectares under cultivation" value={kpis ? Math.round(kpis.totalHectares).toLocaleString() : '—'} hint="Total registered farm area" tone="green" />
      <MetricTile label="AMCOS" value={mamcos.length} hint="Cooperative entities" tone="purple" />
      <MetricTile label="Active crop seasons" value={activeSeasons} hint={`${cropCycles.length} total cycles recorded`} tone="green" />
      <MetricTile label="Field officers" value={activeFieldOfficers} hint="Active extension staff" tone="blue" />
      <MetricTile label="Rice aggregated" value={`${Math.round(totalRiceAggregatedKg).toLocaleString()} kg`} hint={`${inventoryRecords.length} warehouse records`} tone="gold" />
      <MetricTile label="Farmers accessing finance" value={farmersWithFinance} hint={`${loans.length} loan records`} tone="purple" />
      <MetricTile label="Farmers covered by insurance" value={insuranceCoverage?.farmersCovered ?? '—'} hint={`TZS ${Math.round(insuranceCoverage?.totalSumInsured || 0).toLocaleString()} sum insured`} tone="green" />
      <MetricTile label="Revenue" value={money(kpis?.totalRevenue)} hint="Recorded cooperative revenue" />
    </div>

    {/* Trends — how the platform is moving over time, given equal visual
        weight since income and membership growth matter equally to an admin. */}
    <p className="role-section-label">Trends</p>
    <div className="role-two-col-even">
      <ChartCard title="Cooperative income" subtitle="Total revenue + Fairtrade premium recorded per month.">
        <TrendAreaChart
          data={incomeTrendData}
          xKey="period"
          series={[{ key: 'totalIncome', label: 'Income (TZS)', color: 'var(--green-500)' }]}
        />
      </ChartCard>
      <ChartCard title="Membership growth" subtitle="Cumulative cooperative members over time.">
        <TrendAreaChart
          data={membershipTrendData}
          xKey="period"
          series={[{ key: 'cumulativeMembers', label: 'Members', color: 'var(--blue-500)' }]}
        />
      </ChartCard>
    </div>

    {/* Distribution — who the platform serves, paired so gender balance and
        account-type balance can be read side by side. */}
    <p className="role-section-label">Distribution</p>
    <div className="role-two-col-even">
      <ChartCard title="Farmer gender distribution" subtitle="Registered farmers by gender.">
        <DonutBreakdown data={genderChartData} />
      </ChartCard>
      <ChartCard title="Account roles" subtitle="Platform accounts by role.">
        <HorizontalBarChart data={roleChartData} color="var(--purple-500)" />
      </ChartCard>
    </div>
    <div className="role-two-col-even">
      <ChartCard title="Youth farmer breakdown" subtitle="Farmers 35 or younger vs. older, by date of birth on file.">
        <DonutBreakdown data={ageChartData} />
      </ChartCard>
      <ChartCard title="Rice area by region" subtitle="Total registered farm area (ha) summed by region.">
        <HorizontalBarChart data={regionChartData} color="var(--green-400)" />
      </ChartCard>
    </div>

    <ChartCard title="Farmers by district" subtitle="Top districts by registered farmer count.">
      <HorizontalBarChart data={districtChartData} color="var(--gold-400)" height={Math.max(220, districtChartData.length * 34)} />
    </ChartCard>

    {/* Production — season-level status and output, pulled from the same
        crop-cycle records the Rice Seasons module manages. */}
    <p className="role-section-label">Production</p>
    <div className="role-two-col-even">
      <ChartCard title="Rice production by variety" subtitle="Recorded yield (kg) summed by variety, actual where available.">
        <HorizontalBarChart data={varietyChartData} color="var(--green-500)" />
      </ChartCard>
      <ChartCard title="Crop cycle status" subtitle="Season stage across all recorded crop cycles.">
        <DonutBreakdown data={seasonStatusChartData} />
      </ChartCard>
    </div>

    {/* Aggregation — warehouse-side view of the same rice once it leaves the
        farm, kept as its own section since it's a different stage of the
        value chain from crop production above. */}
    <p className="role-section-label">Aggregation</p>
    <div className="role-two-col-even">
      <ChartCard title="Rice by quality grade" subtitle="Aggregated weight (kg) by quality grade.">
        <DonutBreakdown data={gradeChartData} />
      </ChartCard>
      <ChartCard title="Warehouse status" subtitle="Aggregated weight (kg) by warehouse stage.">
        <HorizontalBarChart data={warehouseStatusChartData} color="var(--blue-500)" />
      </ChartCard>
    </div>

    {/* Finance — loan and input-cost health, the two things that determine
        whether a farmer can actually act on the production plan above. */}
    <p className="role-section-label">Finance</p>
    <div className="role-two-col-even">
      <ChartCard title="Loan repayment performance" subtitle="Active and past loans grouped by repayment status.">
        <DonutBreakdown data={loanRepaymentChartData} />
      </ChartCard>
      <ChartCard title="Input distribution status" subtitle="Total input cost (TZS) by category, all crop cycles.">
        <HorizontalBarChart data={inputCategoryChartData} color="var(--gold-400)" />
      </ChartCard>
    </div>

    {/* Insurance — policy coverage and claim outcomes across the platform. */}
    <p className="role-section-label">Insurance</p>
    <div className="role-two-col-even">
      <ChartCard title="Policy status" subtitle="Insurance policies by status, across all products.">
        <DonutBreakdown data={insuranceCoverageChartData} />
      </ChartCard>
      <ChartCard title="Claims by status" subtitle="Insurance claims by outcome, from submission to payout.">
        <DonutBreakdown data={claimsCoverageChartData} />
      </ChartCard>
    </div>

    {/* Field officer activity — ranks staff across every metric the docx
        asks for that has a real per-officer foreign key today. */}
    <p className="role-section-label">Field Officers</p>
    <ChartCard
      title="Field officer ranking"
      subtitle="Ranked by total recorded activity (visits + farms mapped + farmers verified + activities logged). Pending tasks = assigned farmers still awaiting verification. GPS-verified % is a data-completeness proxy; last activity is a proxy for mobile-app sync, since no sync timestamp exists in the system yet."
    >
      <LeaderboardTable
        rows={officerLeaderboard}
        rankBy="totalScore"
        columns={[
          { key: 'name', label: 'Officer' },
          { key: 'visits', label: 'Visits' },
          { key: 'farmsMapped', label: 'Farms Mapped' },
          { key: 'farmersVerified', label: 'Farmers Verified' },
          { key: 'activitiesLogged', label: 'Activities Logged' },
          { key: 'pendingTasks', label: 'Pending Tasks' },
          { key: 'gpsVerifiedPct', label: 'GPS-Verified %' },
          { key: 'lastActivity', label: 'Last Activity' },
        ]}
      />
    </ChartCard>

    {/* Operations — data-quality and day-to-day admin work, kept below the
        analytical charts since it's task-oriented, not headline data. */}
    <p className="role-section-label">Operations</p>
    <div className="role-three-col">
      <InsightPanel title="Data quality queue" subtitle="Issues that reduce audit and analytics quality.">
        <div className="role-list">
          <div className="role-list-item"><strong>Farmers pending verification</strong><span className="badge badge-gold">{unverifiedFarmers}</span></div>
          <div className="role-list-item"><strong>Farms pending verification</strong><span className="badge badge-gold">{unverifiedFarms}</span></div>
          <div className="role-list-item"><strong>Integration payloads stored</strong><span className="badge badge-blue">{integrations.length}</span></div>
        </div>
      </InsightPanel>

      <InsightPanel title="Integration evidence" subtitle="Soil/drone/sorter/QR payloads arriving into MAYOData.">
        {integrations.length ? <div className="role-list">
          {integrations.slice(0, 4).map((record) => <div className="role-list-item" key={record.id}>
            <div>
              <strong>{record.sourceType}</strong>
              <p>{record.externalReference || record.farm?.farmCode || record.cropCycle?.season || 'No external reference'}</p>
            </div>
            <small>{new Date(record.capturedAt).toLocaleDateString()}</small>
          </div>)}
        </div> : <EmptyState>No integration records yet.</EmptyState>}
      </InsightPanel>

      <InsightPanel title="Admin actions" subtitle="Common MAYOData operations.">
        <div className="role-list">
          <ActionLink href="/dashboard/staff" title="Manage staff" text="Create field officer and cooperative accounts." />
          <ActionLink href="/dashboard/mamcos" title="Manage AMCOS" text="Create cooperatives and assign leadership." />
          <ActionLink href="/dashboard/compliance" title="Export compliance evidence" text="Review FLOCERT pack and reports." />
          <ActionLink href="/dashboard/locations" title="Maintain locations" text="Administrative hierarchy for clean records." />
        </div>
      </InsightPanel>
    </div>
  </div>;
}
