'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { irrigationApi, opsApi, accountingApi } from '@/lib/api';
import { printPage } from '@/lib/print';
import { useAuthStore } from '@/store/auth.store';
import { BASE, CardsSkeleton, LoadError, StatusBadge, useApi, useCan } from '@/screens/dashboard/irrigation/ui';
import {
  AllocationSummary, AttentionRow, AttentionTable, BlockStatus, CanalPerformance, ContributionsTrend, CoverageGauge,
  IrrigationActivity, LeadershipWatch, MembersApprovals, MoneySnapshot, OrdersAndStock, OverviewKpis,
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const commercial = useApi<any>(schemeId && showOrders ? () => opsApi.commercialDashboard() : null, [schemeId, showOrders]);
  const contributions = useApi<any>(showContributions ? () => accountingApi.memberContributions() : null, [showContributions]);

  const attention: AttentionRow[] = [];
  if (o?.totals) {
    const t = o.totals;
    if (t.pendingAllocations) attention.push({ task: `${t.pendingAllocations} allocations to approve`, who: 'AMCOS office', due: 'Now', status: 'Waiting', href: `${BASE}/allocation/allocate` });
    if (t.pendingTransfers) attention.push({ task: `${t.pendingTransfers} hectare transfers to approve`, who: 'AMCOS office', due: 'Now', status: 'Waiting', href: `${BASE}/allocation/transfers` });
    const lt = leadership.data?.totals;
    if (lt?.unassignedCanals) attention.push({ task: `${lt.unassignedCanals} canals without a leader`, who: 'Management', due: 'Open', status: 'Open', href: `${BASE}/leadership/overview` });
    if (lt?.blocksWithoutLeaders) attention.push({ task: `${lt.blocksWithoutLeaders} blocks without a leader`, who: 'Management', due: 'Open', status: 'Open', href: `${BASE}/leadership/overview` });
    if (leadership.data?.expiring?.length) attention.push({ task: `${leadership.data.expiring.length} leader terms ending soon`, who: 'Management', due: `Within ${leadership.data.windowDays} days`, status: 'Soon', href: `${BASE}/leadership/overview` });
  }
  if (commercial.data?.ordersAwaitingReview) attention.push({ task: `${commercial.data.ordersAwaitingReview} orders to review`, who: 'Sales desk', due: 'Now', status: 'Waiting', href: '/dashboard/ops-orders' });

  return (
    <div className="page-shell ov-page">
      <div className="ov-head">
        <div>
          <h1 className="ov-greeting">{greeting}{user?.firstName ? `, ${user.firstName}` : ''}!</h1>
          <p className="ov-sub">
            {[o?.scheme?.name ?? mamcosName ?? 'Your AMCOS', o?.scheme?.code, [o?.scheme?.village, o?.scheme?.district].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="ov-actions">
          {o?.scheme && <StatusBadge value={o.scheme.status} />}
          {(schemes.data?.length ?? 0) > 1 && (
            <select className="input-field" aria-label="Scheme" value={schemeId} onChange={(e) => pick(e.target.value)}>
              {schemes.data!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button type="button" className="ov-export" onClick={() => printPage()}>Export</button>
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
          <div className="ov-top">
            <OverviewKpis totals={o.totals} />
            <AllocationSummary distribution={o.blockDistribution} />
          </div>
          <div className="ov-mid">
            {contributions.data?.contributions?.length ? <ContributionsTrend contributions={contributions.data.contributions} /> : <BlockStatus distribution={o.blockDistribution} blocks={allocation.data?.byBlock ?? null} />}
            <div className="ov-stack">
              <CoverageGauge totals={o.totals} />
              {(showOrders || showContributions) && <MoneySnapshot showSales={showOrders} showContributions={showContributions} />}
            </div>
          </div>
          <AttentionTable rows={attention} />
          <CanalPerformance canals={o.canals} />
          <div className="dash-two-col">
            <MembersApprovals totals={o.totals} />
            {leadership.data?.totals ? <LeadershipWatch data={leadership.data} /> : <IrrigationActivity events={o.recent} />}
          </div>
          {leadership.data?.totals && <IrrigationActivity events={o.recent} />}
        </>
      )}

      {showOrders && <OrdersAndStock />}
    </div>
  );
}
