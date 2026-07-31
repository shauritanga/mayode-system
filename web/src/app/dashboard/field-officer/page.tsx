'use client';

import { useEffect, useState } from 'react';
import {
  ActionLink,
  EmptyState,
  InsightPanel,
  MetricTile,
  RoleHero,
} from '@/components/role-dashboards/DashboardPrimitives';
import { cropCyclesApi, farmersApi, farmsApi } from '@/lib/api';

export default function FieldOfficerDashboardPage() {
  const [farmers, setFarmers] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([
      farmersApi.getAll(),
      farmsApi.getAll(),
      cropCyclesApi.getAll(),
      farmsApi.overview(),
    ]).then(([farmerResult, farmResult, cycleResult, overviewResult]) => {
      if (farmerResult.status === 'fulfilled') setFarmers(farmerResult.value.data?.data || farmerResult.value.data || []);
      if (farmResult.status === 'fulfilled') setFarms(farmResult.value.data?.data || farmResult.value.data || []);
      if (cycleResult.status === 'fulfilled') setCycles(cycleResult.value.data || []);
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data);
      if ([farmerResult, farmResult, cycleResult].every((result) => result.status === 'rejected')) {
        setError('Unable to load field operations data.');
      }
    });
  }, []);

  const pendingFarmers = farmers.filter((farmer) => farmer.verificationStatus && farmer.verificationStatus !== 'VERIFIED');
  const pendingFarms = farms.filter((farm) => !farm.isVerified);
  const activeCycles = cycles.filter((cycle) => !['COMPLETED', 'CANCELLED'].includes(cycle.status));

  return <div className="role-dashboard">
    <RoleHero
      eyebrow="Field operations"
      title="Field Officer Dashboard"
      subtitle="A focused workspace for registration, GPS/photo verification, field surveys and crop-cycle follow-up."
    />
    {error && <EmptyState>{error}</EmptyState>}

    <div className="role-grid">
      <MetricTile label="Farmers visible" value={farmers.length} hint={`${pendingFarmers.length} need verification/follow-up`} />
      <MetricTile label="Farms mapped" value={farms.length} hint={`${pendingFarms.length} pending verification`} tone="gold" />
      <MetricTile label="Active crop cycles" value={activeCycles.length} hint="Current production records" tone="blue" />
      <MetricTile label="Verified farms" value={overview?.verifiedFarms ?? farms.filter((farm) => farm.isVerified).length} hint="GPS/photo confidence baseline" tone="green" />
    </div>

    <div className="role-two-col">
      <InsightPanel title="Priority follow-up" subtitle="Records that need field attention first.">
        <div className="role-list">
          {pendingFarmers.slice(0, 6).map((farmer) => <div className="role-list-item" key={farmer.id}>
            <div>
              <strong>{farmer.controlNumber}</strong>
              <p>{farmer.firstName} {farmer.lastName} · {farmer.village || 'Village missing'}</p>
            </div>
            <span className="badge badge-gold">{farmer.verificationStatus}</span>
          </div>)}
          {!pendingFarmers.length && <EmptyState>No pending farmer verifications.</EmptyState>}
        </div>
      </InsightPanel>

      <InsightPanel title="Field actions" subtitle="Fast paths for daily work.">
        <div className="role-list">
          <ActionLink href="/dashboard/farmers" title="Register or review farmers" text="Create farmer profiles and check identity status." />
          <ActionLink href="/dashboard/farm-registry" title="Register farm evidence" text="Capture farm details, GPS and ownership evidence." />
          <ActionLink href="/dashboard/field-surveys" title="Submit field survey" text="Record soil, road, water and physical observations." />
          <ActionLink href="/dashboard/crop-cycles" title="Log crop activity" text="Track planting, input use, labor, costs and harvest." />
        </div>
      </InsightPanel>
    </div>

    <InsightPanel title="Current crop-cycle workload" subtitle="Recent cycles needing production follow-up.">
      {activeCycles.length ? <div className="role-list">
        {activeCycles.slice(0, 8).map((cycle) => <div className="role-list-item" key={cycle.id}>
          <div>
            <strong>{cycle.season}</strong>
            <p>{cycle.farmer?.firstName} {cycle.farmer?.lastName} · {cycle.farm?.farmCode || 'Farm pending'} · {cycle.riceVariety || 'Variety not set'}</p>
          </div>
          <span className="badge badge-blue">{cycle.status}</span>
        </div>)}
      </div> : <EmptyState>No active crop cycles loaded.</EmptyState>}
    </InsightPanel>
  </div>;
}
