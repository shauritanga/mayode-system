'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import { FarmFinder, SchemeTree } from './SchemeTree';
import {
  BASE, CardsSkeleton, Empty, LoadError, PageHeader, Panel, ProgressBar, StatCard, StatusBadge, TableSkeleton,
  fmtDate, fmtHa, fmtNum, useApi, useIrrigation,
} from './ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

const ACTIONS: { label: string; href: string; resource: string; action: string }[] = [
  { label: 'Allocate a hectare', href: `${BASE}/allocation/allocate`, resource: 'irrigation_allocations', action: 'CREATE' },
  { label: 'Add a canal', href: `${BASE}/structure/canals?add=1`, resource: 'irrigation', action: 'CREATE' },
  { label: 'Add a block', href: `${BASE}/structure/blocks?add=1`, resource: 'irrigation', action: 'CREATE' },
  { label: 'Appoint a leader', href: `${BASE}/leadership/assignments`, resource: 'irrigation_leadership', action: 'CREATE' },
  { label: 'Register a transfer', href: `${BASE}/allocation/transfers?add=1`, resource: 'irrigation_allocations', action: 'CREATE' },
];

/** `bare` leaves out the page heading, for pages that already have their own (Scheme Structure). */
export default function Overview({ bare = false }: { bare?: boolean } = {}) {
  const { schemeId, schemes, loading: schemesLoading, can } = useIrrigation();
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.overview({ schemeId }) : null, [schemeId]);

  if (schemesLoading) return <>{!bare && <PageHeader title="Scheme Overview" />}<CardsSkeleton count={8} /></>;
  if (!schemes.length) {
    return (
      <>
        {!bare && <PageHeader title="Scheme Overview" subtitle="Irrigation scheme, canals, blocks and hectare allocation for your AMCOS." />}
        <Panel pad={false}>
          <Empty title="No irrigation scheme has been registered yet"
            hint="Register the scheme first, then add its canals and blocks. Each block gets its 30 hectare units automatically."
            action={can('irrigation', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/structure/scheme`}>Register scheme</Link> : undefined} />
        </Panel>
      </>
    );
  }
  const t = data?.totals;
  const scheme = data?.scheme;
  return (
    <>
      {!bare && (
        <PageHeader
        title={scheme?.name ?? 'Scheme Overview'}
        subtitle={scheme ? [scheme.code, scheme.mamcos?.name, [scheme.village, scheme.ward, scheme.district, scheme.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : undefined}
        crumbs={[{ label: 'Irrigation' }, { label: 'Scheme Overview' }]}
        actions={<>{scheme && <StatusBadge value={scheme.status} />}{scheme && can('irrigation', 'EDIT') && <Link className="btn-secondary" href={`${BASE}/structure/scheme/${scheme.id}`}>Edit scheme</Link>}</>}
        />
      )}
      <LoadError message={error} onRetry={reload} />
      {loading || !t ? <CardsSkeleton count={8} /> : (
        <>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Canals" value={fmtNum(t.canals)} hint={`${scheme.plannedCanalCount} planned`} />
            <StatCard label="Blocks" value={fmtNum(t.blocks)} />
            <StatCard label="Registered hectares" value={fmtNum(t.registeredHectares)} />
            <StatCard label="Allocated hectares" value={fmtNum(t.allocatedHectares)} hint={t.pendingAllocations ? `${t.pendingAllocations} awaiting approval` : undefined} />
            <StatCard label="Unallocated hectares" value={fmtNum(t.unallocatedHectares)} />
          </div>

          <Panel title="Find a farm"><FarmFinder schemeId={schemeId} /></Panel>

          {(data.collection || data.season) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
              {data.collection && (
                <div className="metric-grid" style={{ margin: 0, gridTemplateColumns: '1fr 1fr' }}>
                  <StatCard label="Dues collected" value={data.collection.ratePct == null ? '—' : `${data.collection.ratePct}%`}
                    hint={data.collection.billed ? `${tzs(data.collection.collected)} of ${tzs(data.collection.billed)}` : 'Nothing billed yet'} tone={data.collection.ratePct != null && data.collection.ratePct < 50 ? 'warn' : 'good'} />
                  <StatCard label="Overdue debt" value={tzs(data.collection.overdue)}
                    hint={`${data.collection.farmersOverdue} member${data.collection.farmersOverdue === 1 ? '' : 's'}`} tone={data.collection.overdue ? 'warn' : 'good'} />
                </div>
              )}
              {data.season && (
                <Panel title={`Season · ${data.season.name}`}>
                  <ol style={{ display: 'flex', gap: 6, listStyle: 'none', margin: '0 0 10px', padding: 0, flexWrap: 'wrap' }} aria-label="Season stage">
                    {data.season.steps.map((label: string, i: number) => (
                      <li key={label} aria-current={i === data.season.step ? 'step' : undefined}
                        className={`badge ${i === data.season.step ? 'badge-green' : i < data.season.step ? 'badge-blue' : 'badge-gray'}`}>{i + 1}. {label}</li>
                    ))}
                  </ol>
                  <ProgressBar pct={data.season.progressPct} label="Season time elapsed" />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{fmtDate(data.season.startDate)} – {fmtDate(data.season.endDate)} · {data.season.progressPct}% of the season has passed</div>
                </Panel>
              )}
            </div>
          )}

          <Panel title="Overall allocation progress">
            <ProgressBar pct={t.completionPct} height={12} />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{fmtHa(t.allocatedHectares)} of {fmtHa(t.registeredHectares)} allocated</div>
          </Panel>

          {!bare && data.alerts.length > 0 && (
            <Panel title={`Setup alerts (${data.alerts.length})`} pad={false}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.alerts.map((a: any, i: number) => (
                  <li key={i} style={{ padding: '10px 16px', borderTop: i ? '1px solid var(--border-subtle)' : undefined, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                    <span><span className={`badge ${a.severity === 'warning' ? 'badge-gold' : 'badge-blue'}`} style={{ marginRight: 8 }}>{a.severity === 'warning' ? 'Needs attention' : 'Info'}</span>{a.message}</span>
                    <Link href={a.href} style={{ whiteSpace: 'nowrap' }}>Open</Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Scheme map" pad={false}>
            <SchemeTree canals={data.canals} showDebt={data.canals.some((c: any) => c.debt)}
              empty={<Empty title="No canals yet" hint="Add the scheme's canals to begin." action={can('irrigation', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/structure/canals?add=1`}>Add canal</Link> : undefined} />} />
          </Panel>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Panel title="Block distribution">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
                <div><strong style={{ fontSize: 22 }}>{data.blockDistribution.full}</strong><div className="muted" style={{ fontSize: 12 }}>Fully allocated</div></div>
                <div><strong style={{ fontSize: 22 }}>{data.blockDistribution.partial}</strong><div className="muted" style={{ fontSize: 12 }}>Partly allocated</div></div>
                <div><strong style={{ fontSize: 22 }}>{data.blockDistribution.none}</strong><div className="muted" style={{ fontSize: 12 }}>Not allocated</div></div>
              </div>
            </Panel>
            {!bare && <Panel title="Quick actions">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ACTIONS.filter((a) => can(a.resource, a.action)).map((a) => <Link key={a.href} className="btn-secondary" href={a.href}>{a.label}</Link>)}
                {!ACTIONS.some((a) => can(a.resource, a.action)) && <span className="muted" style={{ fontSize: 13 }}>Your role can view this scheme but not change it.</span>}
              </div>
            </Panel>}
          </div>

          <Panel title="Recent scheme activity" pad={false}>
            {!data.recent.length ? <Empty title="No activity yet" hint="Allocations, transfers and appointments appear here." /> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.recent.map((e: any, i: number) => (
                  <li key={i} style={{ padding: '9px 16px', borderTop: i ? '1px solid var(--border-subtle)' : undefined, fontSize: 13, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                    <span>{e.text}</span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
      {loading && !t && <TableSkeleton />}
    </>
  );
}
