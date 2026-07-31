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
import { farmersApi, farmsApi, integrationsApi, mamcosApi, reportsApi, usersApi } from '@/lib/api';

export default function MayodataAdminDashboardPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [mamcos, setMamcos] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([
      usersApi.getAll(),
      farmersApi.getAll(),
      farmsApi.getAll(),
      mamcosApi.getAll(),
      reportsApi.kpis(),
      integrationsApi.aiRecords(),
    ]).then(([userResult, farmerResult, farmResult, mamcosResult, kpiResult, integrationResult]) => {
      if (userResult.status === 'fulfilled') setUsers(userResult.value.data || []);
      if (farmerResult.status === 'fulfilled') setFarmers(farmerResult.value.data?.data || farmerResult.value.data || []);
      if (farmResult.status === 'fulfilled') setFarms(farmResult.value.data?.data || farmResult.value.data || []);
      if (mamcosResult.status === 'fulfilled') setMamcos(mamcosResult.value.data || []);
      if (kpiResult.status === 'fulfilled') setKpis(kpiResult.value.data);
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

  const unverifiedFarmers = farmers.filter((farmer) => farmer.verificationStatus && farmer.verificationStatus !== 'VERIFIED').length;
  const unverifiedFarms = farms.filter((farm) => !farm.isVerified).length;

  return <div className="role-dashboard">
    <RoleHero
      eyebrow="Platform administration"
      title="MAYOData Admin Dashboard"
      subtitle="System-wide control room for users, cooperatives, data quality, integrations, exports and operational health."
    />
    {error && <EmptyState>{error}</EmptyState>}

    <div className="role-grid">
      <MetricTile label="Users" value={users.length} hint="All platform accounts" tone="blue" />
      <MetricTile label="Farmers" value={farmers.length || kpis?.totalFarmers || '—'} hint={`${unverifiedFarmers} pending verification`} />
      <MetricTile label="Farms" value={farms.length} hint={`${unverifiedFarms} need verification`} tone="gold" />
      <MetricTile label="AMCOS" value={mamcos.length} hint="Cooperative entities" tone="purple" />
      <MetricTile label="Revenue" value={money(kpis?.totalRevenue)} hint="Recorded cooperative revenue" />
      <MetricTile label="Integration records" value={integrations.length} hint="AI/equipment evidence intake" tone="blue" />
    </div>

    <div className="role-two-col">
      <InsightPanel title="Role coverage" subtitle="Account distribution across the platform.">
        {Object.keys(roles).length ? <div className="role-list">
          {Object.entries(roles).map(([role, count]) => <div className="role-list-item" key={role}>
            <strong>{role}</strong>
            <span>{count.toLocaleString()} users</span>
          </div>)}
        </div> : <EmptyState>No user records loaded.</EmptyState>}
      </InsightPanel>

      <InsightPanel title="Data quality queue" subtitle="Issues that reduce audit and analytics quality.">
        <div className="role-list">
          <div className="role-list-item"><strong>Farmers pending verification</strong><span className="badge badge-gold">{unverifiedFarmers}</span></div>
          <div className="role-list-item"><strong>Farms pending verification</strong><span className="badge badge-gold">{unverifiedFarms}</span></div>
          <div className="role-list-item"><strong>Integration payloads stored</strong><span className="badge badge-blue">{integrations.length}</span></div>
        </div>
      </InsightPanel>
    </div>

    <div className="role-two-col">
      <InsightPanel title="Integration evidence" subtitle="Future soil/drone/sorter/QR payloads arriving into MAYOData.">
        {integrations.length ? <div className="role-list">
          {integrations.slice(0, 6).map((record) => <div className="role-list-item" key={record.id}>
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
