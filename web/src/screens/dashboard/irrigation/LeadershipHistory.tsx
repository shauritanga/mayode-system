'use client';
import { farmId } from '@/lib/farm-id';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import { BASE, Empty, Field, Filters, LoadError, PageHeader, Pager, StatusBadge, TableSkeleton, fmtDate, titleCase, useApi, useCanalBlockOptions, useIrrigation } from './ui';

/** Page 14 — every appointment, current and past. */
export default function LeadershipHistory({ bare = false }: { bare?: boolean } = {}) {
  const { schemeId } = useIrrigation();
  const [filters, setFilters] = useState({ canalId: '', blockId: '', position: '', status: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const opts = useCanalBlockOptions(schemeId, filters.canalId);
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.leadership({ schemeId, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 25 }) : null, [schemeId, JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v, ...(k === 'canalId' ? { blockId: '' } : {}) }));
    setPage(1);
  };
  return (
    <>
      {!bare && <PageHeader title="Leadership History" subtitle="Current and past appointments, who replaced whom, and who recorded each change." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Leadership History' }]} />}
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <Filters>
          <Field label="Member"><input className="input-field" placeholder="Name or member no." value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="Canal"><select className="input-field" value={filters.canalId} onChange={(e) => setFilter('canalId', e.target.value)}><option value="">All</option>{opts.canals.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
          <Field label="Block"><select className="input-field" value={filters.blockId} onChange={(e) => setFilter('blockId', e.target.value)}><option value="">All</option>{opts.blocks.map((b: any) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>
          <Field label="Position"><select className="input-field" value={filters.position} onChange={(e) => setFilter('position', e.target.value)}><option value="">All</option><option value="CANAL_LEADER">Canal leader</option><option value="BLOCK_LEADER">Block leader</option></select></Field>
          <Field label="Status"><select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All</option><option value="ACTIVE">Active</option><option value="TERM_EXPIRED">Term expired</option><option value="ENDED">Ended</option></select></Field>
          <Field label="Appointed from"><input type="date" className="input-field" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></Field>
          <Field label="Appointed to"><input type="date" className="input-field" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></Field>
        </Filters>
        {loading ? <TableSkeleton cols={9} rows={8} /> : !data?.data.length ? <Empty title={Object.values(filters).some(Boolean) ? 'No appointments match these filters' : 'No leadership appointments recorded'} /> : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Leader</th><th>Member no.</th><th>Position</th><th>Canal / block</th><th>Start</th><th>End</th><th>Status</th><th>Replacement</th><th>Recorded by</th></tr></thead><tbody>
            {data.data.map((l: any) => (
              <tr key={l.id}>
                <td><Link href={`${BASE}/allocation/farmers/${l.leader.id}`}>{l.leader.name}</Link></td><td>{l.leader.memberNumber}</td><td>{titleCase(l.position)}</td>
                <td>{l.block ? <Link href={`${BASE}/structure/blocks/${l.block.id}`}>{farmId(l.block.code)}</Link> : <Link href={`${BASE}/structure/canals/${l.canal.id}`}>{l.canal.code}</Link>}</td>
                <td>{fmtDate(l.termStart)}</td><td>{l.endedOn ? fmtDate(l.endedOn) : l.termEnd ? `${fmtDate(l.termEnd)} (term)` : 'Open'}</td>
                <td><StatusBadge value={l.status} label={l.status === 'TERM_EXPIRED' ? 'Term expired' : undefined} />{l.endReason && <div className="muted" style={{ fontSize: 11 }}>{l.endReason}</div>}</td>
                <td style={{ fontSize: 12 }}>{l.replacedBy ? `Replaced by ${l.replacedBy.name}` : l.replaces ? `Replaced ${l.replaces.name}` : '—'}</td>
                <td>{l.recordedBy ?? '—'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
    </>
  );
}
