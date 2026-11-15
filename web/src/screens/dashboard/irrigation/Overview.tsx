'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import { SchemeTree } from './SchemeTree';
import {
  BASE, CardsSkeleton, Empty, LoadError, PageHeader, Panel, ProgressBar, StatusBadge, TableSkeleton,
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
  const pct = (n: number, of: number) => (of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0);
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
        <div className="so">
          {/* 1. The answer to "how far along are we?": one focal card, with the structure beside it. */}
          <div className="so-top">
            <section className="so-card so-hero" aria-label="Hectare allocation">
              <div className="so-card-head">
                <div><h3>Hectare allocation</h3><p>How many of the registered hectares have a farmer.</p></div>
              </div>
              <div className="so-hero-figure"><span className="so-big">{Math.round(t.completionPct)}<small>%</small></span><span className="so-hero-text">{fmtHa(t.allocatedHectares)} of {fmtHa(t.registeredHectares)} allocated</span></div>
              <div className="so-stack" role="img" aria-label={`${fmtNum(t.allocatedHectares)} allocated, ${fmtNum(t.pendingAllocations || 0)} awaiting approval, ${fmtNum(t.unallocatedHectares)} free`}>
                <span className="so-seg is-allocated" style={{ width: `${pct(t.allocatedHectares, t.registeredHectares)}%` }} />
                <span className="so-seg is-pending" style={{ width: `${pct(t.pendingAllocations || 0, t.registeredHectares)}%` }} />
              </div>
              <ul className="so-legend">
                <li><span className="so-dot is-allocated" />Allocated <strong>{fmtNum(t.allocatedHectares)}</strong></li>
                {t.pendingAllocations > 0 && <li><span className="so-dot is-pending" />Awaiting approval <strong>{fmtNum(t.pendingAllocations)}</strong></li>}
                <li><span className="so-dot is-free" />Free <strong>{fmtNum(t.unallocatedHectares)}</strong></li>
              </ul>
              <div className="so-blocks" aria-label="Blocks by allocation">
                <span className="so-blocks-title">Blocks</span>
                <span className="so-chip"><strong>{data.blockDistribution.full}</strong> fully allocated</span>
                <span className="so-chip"><strong>{data.blockDistribution.partial}</strong> partly</span>
                <span className="so-chip"><strong>{data.blockDistribution.none}</strong> not started</span>
              </div>
            </section>

            <section className="so-card" aria-label="Scheme structure">
              <div className="so-card-head"><div><h3>Scheme structure</h3><p>What has been set up.</p></div></div>
              <dl className="so-facts">
                <div><dt>Canals</dt><dd>{fmtNum(t.canals)}{scheme.plannedCanalCount ? <small> of {fmtNum(scheme.plannedCanalCount)} planned</small> : null}</dd></div>
                <div><dt>Blocks</dt><dd>{fmtNum(t.blocks)}</dd></div>
                <div><dt>Registered hectares</dt><dd>{fmtNum(t.registeredHectares)}</dd></div>
              </dl>
            </section>
          </div>

          {/* 2. Money and season, only when this scheme has them. */}
          {(data.collection || data.season) && (
            <div className="so-pair">
              {data.collection && (
                <section className="so-card" aria-label="Dues">
                  <div className="so-card-head"><div><h3>Dues</h3><p>Charges billed to members and what has come in.</p></div></div>
                  <div className="so-dues">
                    <div>
                      <div className="so-label">Collected</div>
                      <div className={`so-num${data.collection.ratePct != null && data.collection.ratePct < 50 ? ' is-warn' : ''}`}>{data.collection.ratePct == null ? '—' : `${data.collection.ratePct}%`}</div>
                      <div className="so-sub">{data.collection.billed ? `${tzs(data.collection.collected)} of ${tzs(data.collection.billed)}` : 'Nothing billed yet'}</div>
                    </div>
                    <div>
                      <div className="so-label">Overdue</div>
                      <div className={`so-num${data.collection.overdue ? ' is-bad' : ''}`}>{tzs(data.collection.overdue)}</div>
                      <div className="so-sub">{data.collection.farmersOverdue} member{data.collection.farmersOverdue === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </section>
              )}
              {data.season && (
                <section className="so-card" aria-label="Season">
                  <div className="so-card-head"><div><h3>Season · {data.season.name}</h3><p>{fmtDate(data.season.startDate)} to {fmtDate(data.season.endDate)}</p></div><span className="so-pill">{data.season.progressPct}% elapsed</span></div>
                  <ol className="so-steps" aria-label="Season stage">
                    {data.season.steps.map((label: string, i: number) => (
                      <li key={label} className={i === data.season.step ? 'is-now' : i < data.season.step ? 'is-done' : ''} aria-current={i === data.season.step ? 'step' : undefined}><span>{i + 1}</span>{label}</li>
                    ))}
                  </ol>
                  <ProgressBar pct={data.season.progressPct} label="Season time elapsed" />
                </section>
              )}
            </div>
          )}

          {!bare && data.alerts.length > 0 && (
            <section className="so-card" aria-label="Setup alerts">
              <div className="so-card-head"><div><h3>Needs attention</h3><p>{data.alerts.length} thing{data.alerts.length === 1 ? '' : 's'} to set up or check.</p></div></div>
              <ul className="so-list">
                {data.alerts.map((a: any, i: number) => (
                  <li key={i}><span><span className={`badge ${a.severity === 'warning' ? 'badge-gold' : 'badge-blue'}`}>{a.severity === 'warning' ? 'Attention' : 'Info'}</span>{a.message}</span><Link href={a.href}>Open</Link></li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. The structure itself: the thing people came to see. */}
          <section className="so-card so-map" aria-label="Canals and blocks">
            <div className="so-card-head"><div><h3>Canals and blocks</h3><p>Open a canal to see its blocks, then a block to see its hectares.</p></div></div>
            <SchemeTree canals={data.canals} showDebt={data.canals.some((c: any) => c.debt)}
              empty={<Empty title="No canals yet" hint="Add the scheme's canals to begin." action={can('irrigation', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/structure/canals?add=1`}>Add canal</Link> : undefined} />} />
          </section>

          {!bare && (
            <section className="so-card" aria-label="Quick actions">
              <div className="so-card-head"><div><h3>Quick actions</h3></div></div>
              <div className="so-actions">
                {ACTIONS.filter((a) => can(a.resource, a.action)).map((a) => <Link key={a.href} className="btn-secondary" href={a.href}>{a.label}</Link>)}
                {!ACTIONS.some((a) => can(a.resource, a.action)) && <span className="muted" style={{ fontSize: 13 }}>Your role can view this scheme but not change it.</span>}
              </div>
            </section>
          )}

          <section className="so-card" aria-label="Recent activity">
            <div className="so-card-head"><div><h3>Recent activity</h3><p>Allocations, transfers and appointments.</p></div></div>
            {!data.recent.length ? <Empty title="No activity yet" hint="Allocations, transfers and appointments appear here." /> : (
              <ul className="so-list">
                {data.recent.slice(0, 6).map((e: any, i: number) => (
                  <li key={i}><span>{e.text}</span><span className="muted">{fmtDate(e.at)}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {loading && !t && <TableSkeleton />}
    </>
  );
}
