'use client';
import type { ReactNode } from 'react';
import { EmptyState, MetricTile, money } from '@/components/role-dashboards/DashboardPrimitives';
import { FarmerDataProvider, useFarmerData } from './FarmerDataContext';

function FarmerShell({ children }: { children: ReactNode }) {
  const { farmer, profile, farms, cycles, alerts, message, error, loading } = useFarmerData();

  if (error && !farmer) {
    return <div className="role-dashboard">
      <EmptyState>{error}</EmptyState>
    </div>;
  }

  const finance = profile?.finance;
  const production = profile?.production;

  return <div className="role-dashboard">
    {message && <div className="alert-box alert-success">{message}</div>}
    {error && <div className="alert-box alert-danger">{error}</div>}

    <div className="role-grid">
      <MetricTile label="Registered farms" value={farms.length || (loading ? '—' : 0)} hint="Linked to your profile" />
      <MetricTile label="Crop cycles" value={cycles.length || 0} hint="Seasonal production records" tone="blue" />
      <MetricTile label="Total yield" value={`${Math.round(production?.totalYieldKg || 0).toLocaleString()} kg`} hint={`${production?.harvestedCycles || 0} harvested cycles`} tone="gold" />
      <MetricTile label="Net farm income" value={money(finance?.netProfit)} hint="Revenue less costs" tone={finance?.netProfit >= 0 ? 'green' : 'red'} />
      <MetricTile label="Credit score" value={profile?.credit?.creditScore ?? '—'} hint={profile?.credit?.creditReady ? 'Credit ready' : 'Building track record'} tone="purple" />
      <MetricTile label="Open alerts" value={alerts.filter((alert) => alert.status !== 'COMPLETED').length} hint="Recommendations and reminders" tone="red" />
    </div>

    {children}
  </div>;
}

export default function FarmerLayout({ children }: { children: ReactNode }) {
  return (
    <FarmerDataProvider>
      <FarmerShell>{children}</FarmerShell>
    </FarmerDataProvider>
  );
}
