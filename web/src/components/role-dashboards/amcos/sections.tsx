'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { ReactNode } from 'react';
import {
  Building05Icon, CheckmarkBadge02Icon, DashboardSquare01Icon, MapsIcon, Plant01Icon, UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { opsApi, accountingApi } from '@/lib/api';
import { ChartCard, DonutBreakdown } from '../Charts';
import { MetricTile } from '../DashboardPrimitives';
import { BASE, LoadError, ProgressBar, StatusBadge, fmtDate, fmtNum, useApi } from '@/screens/dashboard/irrigation/ui';

const tzs = (value?: number | null) => `TZS ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
const kg = (value?: number | null) => `${Math.round(Number(value) || 0).toLocaleString('en-US')} kg`;

function Panel({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="insight-panel">
      <div className="insight-panel-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {badge}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <div className="chart-empty-state">{children}</div>;

/** Headline scheme figures. `totals` comes from GET /irrigation/overview. */
export function SchemeStatistics({ totals, plannedCanals }: { totals: any; plannedCanals?: number }) {
  return (
    <div className="scheme-stat-grid">
      <MetricTile label="Canals" value={fmtNum(totals.canals)} hint={plannedCanals ? `${plannedCanals} planned` : undefined} icon={Building05Icon} tone="blue" />
      <MetricTile label="Blocks" value={fmtNum(totals.blocks)} icon={DashboardSquare01Icon} tone="purple" />
      <MetricTile label="Registered hectares" value={fmtNum(totals.registeredHectares)} icon={MapsIcon} tone="green" />
      <MetricTile label="Allocated hectares" value={fmtNum(totals.allocatedHectares)} hint={`${totals.completionPct}% complete`} icon={Plant01Icon} tone="green" />
      <MetricTile label="Unallocated hectares" value={fmtNum(totals.unallocatedHectares)} icon={MapsIcon} tone={totals.unallocatedHectares ? 'gold' : 'green'} />
      <MetricTile label="Farmers with a hectare" value={fmtNum(totals.registeredFarmers)} icon={UserGroupIcon} tone="blue" />
      <MetricTile label="Canal leaders" value={`${totals.canalLeaders} / ${totals.canals}`} icon={CheckmarkBadge02Icon} tone={totals.canalLeaders < totals.canals ? 'red' : 'green'} />
      <MetricTile label="Block leaders" value={`${totals.blockLeaders} / ${totals.blocks}`} icon={CheckmarkBadge02Icon} tone={totals.blockLeaders < totals.blocks ? 'red' : 'green'} />
    </div>
  );
}

export function CanalPerformance({ canals }: { canals: any[] }) {
  const ranked = [...canals].filter((c) => c.hectareUnits > 0).sort((a, b) => b.completionPct - a.completionPct);
  // Only call out highest/lowest when the canals actually differ.
  const differ = ranked.length > 1 && ranked[0].completionPct !== ranked[ranked.length - 1].completionPct;
  const best = differ ? ranked[0].id : undefined;
  const worst = differ ? ranked[ranked.length - 1].id : undefined;
  return (
    <Panel title="Canal performance" subtitle="Allocation progress and leadership per canal." badge={<Link href={`${BASE}/structure/canals`} className="badge badge-blue">All canals</Link>}>
      {!canals.length ? <Empty>No canals registered yet.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Canal</th><th className="num">Blocks</th><th className="num">Hectares</th><th className="num">Allocated</th><th style={{ minWidth: 150 }}>Progress</th><th>Leader</th></tr></thead>
            <tbody>
              {canals.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`${BASE}/structure/canals/${c.id}`} style={{ fontWeight: 600 }}>{c.code}</Link>{c.id === best && <span className="badge badge-green" style={{ marginLeft: 6 }}>Highest</span>}{c.id === worst && <span className="badge badge-gold" style={{ marginLeft: 6 }}>Lowest</span>}</td>
                  <td className="num">{c.blockCount}</td><td className="num">{fmtNum(c.area)}</td><td className="num">{fmtNum(c.allocatedUnits)}</td>
                  <td><ProgressBar pct={c.completionPct} /><span className="muted" style={{ fontSize: 11 }}>{c.completionPct}%</span></td>
                  <td>{c.leader ? c.leader.name : <StatusBadge value="UNASSIGNED" label="No leader" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Block status: donut of full/partial/none plus the blocks that most need attention. */
export function BlockStatus({ distribution, blocks }: { distribution: { full: number; partial: number; none: number }; blocks: any[] | null }) {
  const attention = (blocks ?? [])
    .filter((b) => b.state !== 'FULL')
    .sort((a, b) => a.completionPct - b.completionPct)
    .slice(0, 6);
  return (
    <ChartCard title="Block status" subtitle="How fully each block is allocated.">
      <DonutBreakdown height={190} data={[
        { name: 'Fully allocated', value: distribution.full },
        { name: 'Partly allocated', value: distribution.partial },
        { name: 'Not allocated', value: distribution.none },
      ]} />
      {attention.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Blocks needing attention</div>
          <div className="role-list">
            {attention.map((b) => (
              <Link key={b.id} href={`${BASE}/structure/blocks/${b.id}`} className="role-list-item">
                <span style={{ fontWeight: 600 }}>{b.code}</span>
                <span className="muted" style={{ fontSize: 12 }}>{b.allocatedUnits}/{b.hectareUnits} allocated · {b.completionPct}%</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export function MembersApprovals({ totals }: { totals: any }) {
  const rows: [string, ReactNode, string?][] = [
    ['AMCOS members', totals.amcosMembers == null ? '—' : fmtNum(totals.amcosMembers)],
    ['Members with a hectare', fmtNum(totals.registeredFarmers)],
    ['Members without a hectare', totals.membersWithoutHectare == null ? '—' : fmtNum(totals.membersWithoutHectare)],
    ['Allocations awaiting approval', fmtNum(totals.pendingAllocations), `${BASE}/allocation/allocate`],
    ['Transfers awaiting approval', fmtNum(totals.pendingTransfers), `${BASE}/allocation/transfers`],
  ];
  return (
    <Panel title="Members & approvals" subtitle="Who farms the scheme and what is waiting for a decision.">
      <div className="role-list">
        {rows.map(([label, value, href]) => {
          const content = <><span>{label}</span><strong>{value}</strong></>;
          return href ? <Link key={label} href={href} className="role-list-item">{content}</Link> : <div key={label} className="role-list-item">{content}</div>;
        })}
      </div>
    </Panel>
  );
}

export function LeadershipWatch({ data }: { data: any }) {
  const t = data.totals;
  return (
    <Panel title="Leadership watch" subtitle="Coverage and appointments about to lapse." badge={<Link href={`${BASE}/leadership/overview`} className="badge badge-blue">Details</Link>}>
      <div className="role-list">
        <div className="role-list-item"><span>Canals without a leader</span><strong style={{ color: t.unassignedCanals ? 'var(--red-400)' : undefined }}>{t.unassignedCanals}</strong></div>
        <div className="role-list-item"><span>Blocks without a leader</span><strong style={{ color: t.blocksWithoutLeaders ? 'var(--red-400)' : undefined }}>{t.blocksWithoutLeaders}</strong></div>
        <div className="role-list-item"><span>Expiring within {data.windowDays} days</span><strong>{data.expiring.length}</strong></div>
      </div>
      {data.expiring.slice(0, 4).map((a: any) => (
        <div key={a.id} className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {a.leader.name} · {a.block?.code ?? a.canal.code} · {a.daysLeft != null && a.daysLeft < 0 ? 'term expired' : `ends ${fmtDate(a.termEnd)}`}
        </div>
      ))}
    </Panel>
  );
}

export function IrrigationActivity({ events }: { events: any[] }) {
  return (
    <Panel title="Irrigation activities" subtitle="Latest allocations, transfers and appointments.">
      {!events.length ? <Empty>No scheme activity yet.</Empty> : (
        <div className="role-list">
          {events.map((e, i) => (
            <div key={i} className="role-list-item"><span>{e.text}</span><span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(e.at)}</span></div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Orders and stock for the AMCOS. Only mounted for roles with ops_reports VIEW, so it never makes a call that would fail. */
export function OrdersAndStock() {
  const { data, loading, error, reload } = useApi<any>(() => opsApi.commercialDashboard(), []);
  return (
    <Panel title="Orders & stock" subtitle="Sales workload and rice on hand." badge={<Link href="/dashboard/ops-orders" className="badge badge-blue">Orders</Link>}>
      <LoadError message={error} onRetry={reload} />
      {loading ? <div className="skeleton" style={{ height: 120 }} /> : !data ? null : (
        <div className="role-list">
          <div className="role-list-item"><span>Orders awaiting review</span><strong>{fmtNum(data.ordersAwaitingReview)}</strong></div>
          <div className="role-list-item"><span>Orders awaiting fulfilment</span><strong>{fmtNum(data.ordersAwaitingFulfilment)}</strong></div>
          <div className="role-list-item"><span>Paddy in stock</span><strong>{kg(data.stock?.paddyKg)}</strong></div>
          <div className="role-list-item"><span>Processed rice in stock</span><strong>{kg(data.stock?.processedKg)}</strong></div>
          <div className="role-list-item"><span>Low-stock items</span><strong style={{ color: data.stock?.lowStock?.length ? 'var(--red-400)' : undefined }}>{fmtNum(data.stock?.lowStock?.length ?? 0)}</strong></div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Money snapshot from AMCOS-scoped sources only (invoices/payments from the sales desk, member contributions). The general
 * ledger endpoints are platform-wide, so they are deliberately not used here.
 */
export function MoneySnapshot({ showSales, showContributions }: { showSales: boolean; showContributions: boolean }) {
  const sales = useApi<any>(showSales ? () => opsApi.commercialDashboard() : null, [showSales]);
  const contributions = useApi<any>(showContributions ? () => accountingApi.memberContributions() : null, [showContributions]);
  const loading = sales.loading || contributions.loading;
  return (
    <Panel title="Money snapshot" subtitle="Collections and amounts still owed to the AMCOS." badge={<Link href="/dashboard/accounting" className="badge badge-blue">Accounting</Link>}>
      <LoadError message={sales.error || contributions.error} />
      {loading ? <div className="skeleton" style={{ height: 120 }} /> : (
        <div className="role-list">
          {showSales && <>
            <div className="role-list-item"><span>Invoices issued</span><strong>{tzs(sales.data?.invoicesIssued?.value)}</strong></div>
            <div className="role-list-item"><span>Payments confirmed</span><strong>{tzs(sales.data?.confirmedPayments?.value)}</strong></div>
            <div className="role-list-item"><span>Invoices outstanding</span><strong style={{ color: sales.data?.invoicesOutstanding?.value ? 'var(--gold-400)' : undefined }}>{tzs(sales.data?.invoicesOutstanding?.value)}</strong></div>
          </>}
          {showContributions && <div className="role-list-item"><span>Member contributions</span><strong>{tzs(contributions.data?.totalContributions)}</strong></div>}
        </div>
      )}
    </Panel>
  );
}

