'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { ReactNode } from 'react';
import {
  Building05Icon, CheckmarkBadge02Icon, DashboardSquare01Icon, MapsIcon, Plant01Icon, UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { ChartCard, DonutBreakdown, GaugeArcs, TrendAreaChart } from '../Charts';
import { MetricTile } from '../DashboardPrimitives';
import { BASE, LoadError, ProgressBar, StatusBadge, fmtDate, fmtNum } from '@/screens/dashboard/irrigation/ui';

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
export function OrdersAndStock({ data }: { data: any }) {
  const loading = false, error = '', reload = () => undefined;
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
export function MoneySnapshot({ showSales, showContributions, salesData, contributionsData }: { showSales: boolean; showContributions: boolean; salesData: any; contributionsData: any }) {
  const sales = { data: salesData, error: '' };
  const contributions = { data: contributionsData, error: '' };
  const loading = false;
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


/** Four headline cards for the top of the overview. */
export function OverviewKpis({ totals }: { totals: any }) {
  const leaderTotal = (totals.canals || 0) + (totals.blocks || 0);
  const leaderHave = (totals.canalLeaders || 0) + (totals.blockLeaders || 0);
  const cards: { label: string; accent: string; value: string; note: string; good?: boolean; icon: any }[] = [
    { label: 'Registered hectares', accent: '#22c55e', value: fmtNum(totals.registeredHectares), note: `${fmtNum(totals.canals)} canals · ${fmtNum(totals.blocks)} blocks`, icon: MapsIcon },
    { label: 'Allocated hectares', accent: '#3b82f6', value: fmtNum(totals.allocatedHectares), note: `${totals.completionPct}% allocated`, good: totals.completionPct >= 50, icon: Plant01Icon },
    { label: 'Farmers with a hectare', accent: '#f59e0b', value: fmtNum(totals.registeredFarmers), note: totals.membersWithoutHectare ? `${fmtNum(totals.membersWithoutHectare)} members without` : 'All members covered', good: !totals.membersWithoutHectare, icon: UserGroupIcon },
    { label: 'Leadership coverage', accent: '#a855f7', value: `${leaderHave} / ${leaderTotal}`, note: leaderHave < leaderTotal ? `${leaderTotal - leaderHave} posts open` : 'All posts filled', good: leaderHave >= leaderTotal, icon: CheckmarkBadge02Icon },
  ];
  return (
    <div className="ov-kpis">
      {cards.map((c) => (
        <article key={c.label} className="ov-card ov-kpi">
          <div className="ov-kpi-top"><span>{c.label}</span><HugeiconsIcon icon={c.icon} size={20} strokeWidth={1.8} /></div>
          <strong>{c.value}</strong>
          <small className={c.good ? 'ov-up' : 'ov-down'}>{c.note}</small>
        </article>
      ))}
    </div>
  );
}

/** Block allocation donut, restyled as an overview card. */
export function AllocationSummary({ distribution }: { distribution: { full: number; partial: number; none: number } }) {
  return (
    <section className="ov-card">
      <h2 className="ov-title">Block allocation summary</h2>
      <DonutBreakdown height={170} colors={['var(--green-500)', 'var(--blue-500)', 'var(--blue-400)']} data={[
        { name: 'Fully allocated', value: distribution.full },
        { name: 'Partly allocated', value: distribution.partial },
        { name: 'Not allocated', value: distribution.none },
      ]} />
    </section>
  );
}

/** Money received in each of the last 12 months: sales payments, dues and fees, member contributions. */
export function PaymentsTrend({ data }: { data: any }) {
  const months: any[] = data?.months ?? [];
  const wanted = [
    { key: 'sales', label: 'Sales payments', color: 'var(--green-500)' },
    { key: 'dues', label: 'Dues & fees', color: 'var(--blue-500)' },
    { key: 'contributions', label: 'Contributions', color: 'var(--gold-400)' },
  ].filter((x) => data?.series?.[x.key]);
  const peak = Math.max(0, ...months.map((m) => wanted.reduce((n, x) => n + (m[x.key] || 0), 0)));
  const unit = peak >= 1_000_000 ? 1_000_000 : peak >= 10_000 ? 1_000 : 1;
  const unitLabel = unit === 1_000_000 ? 'TZS millions' : unit === 1_000 ? 'TZS thousands' : 'TZS';
  const chart = months.map((m) => Object.fromEntries([['month', m.label], ...wanted.map((x) => [x.key, Math.round(((m[x.key] || 0) / unit) * 10) / 10])]));
  const total = wanted.reduce((n, x) => n + months.reduce((a, m) => a + (m[x.key] || 0), 0), 0);
  const sumOf = (m: any) => wanted.reduce((n, x) => n + (m?.[x.key] || 0), 0);
  const thisMonth = sumOf(months[months.length - 1]);
  const lastMonth = sumOf(months[months.length - 2]);
  const change = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  return (
    <section className="ov-card ov-fill">
      <h2 className="ov-title">Payments received, last 12 months</h2>
      {!wanted.length || !total ? <Empty>No payments have been received in the last 12 months.</Empty> : (
        <>
          <p className="muted" style={{ fontSize: 12, margin: '-6px 0 8px' }}>
            {tzs(total)} in total{data.peak ? ` · busiest month ${data.peak.label} (${tzs(data.peak.amount)})` : ''} · chart in {unitLabel}
          </p>
          <TrendAreaChart data={chart} xKey="month" series={wanted.map((x) => ({ key: x.key, label: x.label, color: x.color }))} height={230} />
          <div className="ov-foot">
            {[['This month', thisMonth], ['Last month', lastMonth]].map(([label, value]) => (
              <div key={label as string}><span>{label}</span><strong>{tzs(value as number)}</strong></div>
            ))}
            <div><span>Change</span><strong className={change == null ? '' : change >= 0 ? 'ov-up' : 'ov-down'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${change}%`}</strong></div>
          </div>
        </>
      )}
    </section>
  );
}

/** Half-circle gauge for allocation and leader coverage. */
export function CoverageGauge({ totals }: { totals: any }) {
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
  return (
    <section className="ov-card">
      <h2 className="ov-title">Scheme coverage</h2>
      <GaugeArcs arcs={[
        { label: 'Hectares allocated', pct: totals.completionPct ?? 0, color: 'var(--green-500)' },
        { label: 'Canals with a leader', pct: pct(totals.canalLeaders, totals.canals), color: 'var(--blue-500)' },
        { label: 'Blocks with a leader', pct: pct(totals.blockLeaders, totals.blocks), color: 'var(--gold-400)' },
      ]} />
    </section>
  );
}

export type AttentionRow = { task: string; who: string; due: string; status: 'Waiting' | 'Open' | 'Soon'; href: string };

/** "Needs attention" list in the task-table style, built from figures the page has already loaded. */
export function AttentionTable({ rows }: { rows: AttentionRow[] }) {
  return (
    <section className="ov-card">
      <div className="ov-title-row">
        <h2 className="ov-title">Needs attention</h2>
      </div>
      {!rows.length ? <Empty>Nothing is waiting for you.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table ov-table">
            <thead><tr><th>Task</th><th>Who</th><th>When</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.task}>
                  <td style={{ fontWeight: 600 }}>{r.task}</td>
                  <td>{r.who}</td>
                  <td>{r.due}</td>
                  <td><span className={`badge ${r.status === 'Soon' ? 'badge-gold' : r.status === 'Waiting' ? 'badge-blue' : 'badge-red'}`}>{r.status}</span></td>
                  <td><Link href={r.href} className="ov-link">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
