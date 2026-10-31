'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { BASE, CardsSkeleton, LoadError, StatusBadge, useApi, useCan } from '@/screens/dashboard/irrigation/ui';
import {
  BlockStatus, CanalPerformance, IrrigationActivity, LeadershipWatch, MembersApprovals, MoneySnapshot,
  OrdersAndStock, SchemeStatistics,
} from './amcos/sections';

/**
 * AMCOS landing page: the irrigation scheme first (statistics, alerts, canals, blocks, members, leadership, activity),
 * then orders, stock and money. Every section is permission-gated and loads on its own.
 */
export function SecretaryDashboard() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const showScheme = can('irrigation', 'VIEW');
  const showAllocation = can('irrigation_allocations', 'VIEW');
  const showLeadership = can('irrigation_leadership', 'VIEW');
  const showOrders = can('ops_reports', 'VIEW');
  const showContributions = can('accounting', 'VIEW');

  const schemes = useApi<any[]>(showScheme ? () => irrigationApi.schemes() : null, [showScheme]);
  const [chosen, setChosen] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('irrigation.schemeId') ?? '' : ''));
  const schemeId = schemes.data?.find((s) => s.id === chosen)?.id ?? schemes.data?.[0]?.id ?? '';
  const pick = useCallback((id: string) => { setChosen(id); if (typeof window !== 'undefined') localStorage.setItem('irrigation.schemeId', id); }, []);

  const overview = useApi<any>(schemeId ? () => irrigationApi.overview({ schemeId }) : null, [schemeId]);
  const allocation = useApi<any>(schemeId && showAllocation ? () => irrigationApi.allocationOverview({ schemeId }) : null, [schemeId, showAllocation]);
  const leadership = useApi<any>(schemeId && showLeadership ? () => irrigationApi.leadershipOverview({ schemeId }) : null, [schemeId, showLeadership]);

  const o = overview.data;
  const noScheme = showScheme && !schemes.loading && !schemes.error && !(schemes.data?.length);
  const mamcosName = schemes.data?.find((s) => s.id === schemeId)?.mamcos?.name;

  return (
    <div className="page-shell">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div className="page-kicker" style={{ marginBottom: 4 }}>{mamcosName ?? 'MAYODE GROUP Cooperative'}</div>
          <h1 className="page-title" style={{ fontSize: '1.7rem' }}>{o?.scheme?.name ?? 'Your AMCOS'}</h1>
          <p className="page-subtitle">
            {o?.scheme ? [o.scheme.code, [o.scheme.village, o.scheme.district].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : `Welcome${user?.firstName ? `, ${user.firstName}` : ''}.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {o?.scheme && <StatusBadge value={o.scheme.status} />}
          {(schemes.data?.length ?? 0) > 1 && (
            <select className="input-field" aria-label="Scheme" value={schemeId} onChange={(e) => pick(e.target.value)}>
              {schemes.data!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <LoadError message={schemes.error || overview.error} onRetry={() => { schemes.reload(); overview.reload(); }} />

      {noScheme && (
        <section className="insight-panel">
          <div className="insight-panel-head"><div><h2>No irrigation scheme yet</h2><p>Register the scheme, then add its canals and blocks. Each block gets its hectare units automatically.</p></div></div>
          {can('irrigation', 'CREATE') && <Link className="btn-primary" href={`${BASE}/structure/scheme`} style={{ display: 'inline-block' }}>Register scheme</Link>}
        </section>
      )}

      {showScheme && (schemes.loading || (schemeId && overview.loading)) && <CardsSkeleton count={8} />}

      {o?.totals && (
        <>
          <SchemeStatistics totals={o.totals} plannedCanals={o.scheme.plannedCanalCount} />
          <CanalPerformance canals={o.canals} />
          <div className="dash-two-col">
            <BlockStatus distribution={o.blockDistribution} blocks={allocation.data?.byBlock ?? null} />
            <MembersApprovals totals={o.totals} />
          </div>
          <div className="dash-two-col">
            {leadership.data?.totals ? <LeadershipWatch data={leadership.data} /> : null}
            <IrrigationActivity events={o.recent} />
          </div>
        </>
      )}

      {(showOrders || showContributions) && (
        <div className="dash-two-col">
          {showOrders && <OrdersAndStock />}
          <MoneySnapshot showSales={showOrders} showContributions={showContributions} />
        </div>
      )}
    </div>
  );
}
