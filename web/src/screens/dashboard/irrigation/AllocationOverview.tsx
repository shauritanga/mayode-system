'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import {
  BASE, CardsSkeleton, Empty, Field, Filters, LoadError, PageHeader, Panel, ProgressBar, StatCard, StatusBadge, TableSkeleton,
  fmtNum, useApi, useCanalBlockOptions, useIrrigation,
} from './ui';

/** Page 8 — allocation statistics and progress by canal and block. */
export default function AllocationOverview() {
  const { schemeId, can, schemes, loading: schemesLoading } = useIrrigation();
  const [canalId, setCanalId] = useState('');
  const [blockId, setBlockId] = useState('');
  const opts = useCanalBlockOptions(schemeId, canalId);
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.allocationOverview({ schemeId, canalId: canalId || undefined, blockId: blockId || undefined }) : null, [schemeId, canalId, blockId]);
  const t = data?.totals;
  return (
    <>
      <PageHeader title="Farmer Allocation Overview" subtitle="How much of the scheme is allocated to members, by canal and block." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Allocation Overview' }]}
        actions={can('irrigation_allocations', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/allocation/allocate`}>Allocate hectares</Link> : undefined} />
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel" style={{ marginBottom: 16 }}>
        <Filters>
          <Field label="Canal"><select className="input-field" value={canalId} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); }}><option value="">All canals</option>{opts.canals.map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => setBlockId(e.target.value)}><option value="">All blocks</option>{opts.blocks.map((b: any) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
        </Filters>
      </section>
      {(!schemesLoading && !schemes.length) || (!loading && data && !data.scheme) ? (
        <Panel pad={false}><Empty title="No irrigation scheme has been registered yet" hint="Register the scheme and its canals and blocks first." action={can('irrigation', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/structure/scheme`}>Register scheme</Link> : undefined} /></Panel>
      ) : loading || !t ? <CardsSkeleton count={8} /> : (
        <>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Total hectares" value={fmtNum(t.totalHectares)} />
            <StatCard label="Allocated hectares" value={fmtNum(t.allocatedHectares)} hint={t.pendingAllocations ? `${t.pendingAllocations} awaiting approval` : undefined} />
            <StatCard label="Unallocated hectares" value={fmtNum(t.unallocatedHectares)} />
            <StatCard label="Active farmer allocations" value={fmtNum(t.activeAllocations)} />
            <StatCard label="Blocks fully allocated" value={fmtNum(t.blocksFull)} />
            <StatCard label="Blocks partly allocated" value={fmtNum(t.blocksPartial)} />
            <StatCard label="Blocks with no allocation" value={fmtNum(t.blocksNone)} />
            <StatCard label="Completion" value={`${t.completionPct}%`} />
          </div>
          <Panel title="Progress by canal" pad={false}>
            {!data.byCanal.length ? <Empty title="No canals to show" /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Canal</th><th className="num">Hectares</th><th className="num">Allocated</th><th className="num">Unallocated</th><th style={{ minWidth: 160 }}>Progress</th><th className="num">Full</th><th className="num">Partial</th><th className="num">None</th></tr></thead><tbody>
                {data.byCanal.map((c: any) => (
                  <tr key={c.id}><td><Link href={`${BASE}/structure/canals/${c.id}`}>{c.code} · {c.name}</Link></td><td className="num">{fmtNum(c.hectareUnits)}</td><td className="num">{fmtNum(c.allocatedUnits)}</td><td className="num">{fmtNum(c.unallocatedUnits)}</td>
                    <td><ProgressBar pct={c.completionPct} /><span className="muted" style={{ fontSize: 11 }}>{c.completionPct}%</span></td><td className="num">{c.blocksFull}</td><td className="num">{c.blocksPartial}</td><td className="num">{c.blocksEmpty}</td></tr>
                ))}
              </tbody></table></div>
            )}
          </Panel>
          <Panel title="Progress by block" pad={false}>
            {loading ? <TableSkeleton /> : !data.byBlock.length ? <Empty title="No blocks to show" /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Block</th><th>Canal</th><th className="num">Units</th><th className="num">Allocated</th><th className="num">Unallocated</th><th className="num">Farmers</th><th style={{ minWidth: 140 }}>Progress</th><th>State</th></tr></thead><tbody>
                {data.byBlock.map((b: any) => (
                  <tr key={b.id}><td><Link href={`${BASE}/structure/blocks/${b.id}`}>{b.code}</Link></td><td>{b.canalCode}</td><td className="num">{b.hectareUnits}</td><td className="num">{b.allocatedUnits}</td><td className="num">{b.unallocatedUnits}</td><td className="num">{b.farmerCount}</td>
                    <td><ProgressBar pct={b.completionPct} /></td><td><StatusBadge value={b.state} label={b.state === 'NONE' ? 'Not allocated' : undefined} /></td></tr>
                ))}
              </tbody></table></div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
