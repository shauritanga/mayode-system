'use client';
import { farmId } from '@/lib/farm-id';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import {
  BASE, Empty, Field, Filters, LoadError, Pager, StatCard, StatusBadge, TableSkeleton,
  fmtDate, useApi, useCanalBlockOptions, useIrrigation,
} from './ui';

/** Page 7 — the register of individual hectare units, viewable by block. */
export function HectareRegister() {
  const { schemeId, can } = useIrrigation();
  const search = useSearchParams();
  const [filters, setFilters] = useState({ canalId: '', blockId: search.get('blockId') ?? '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const opts = useCanalBlockOptions(schemeId, filters.canalId);
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.hectares({ schemeId, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 10 }) : null, [schemeId, JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v, ...(k === 'canalId' ? { blockId: '' } : {}) }));
    setPage(1);
  };
  const block = opts.blocks.find((b: any) => b.id === filters.blockId);
  return (
    <>
      <LoadError message={error} onRetry={reload} />
      {block && <div className="metric-grid" style={{ marginBottom: 16 }}>
        <StatCard label={`${farmId(block.code)} units`} value={`${block.stats.hectareUnits} / ${block.hectareCount}`} />
        <StatCard label="Allocated" value={block.stats.allocatedUnits} /><StatCard label="Unallocated" value={block.stats.unallocatedUnits} />
      </div>}
      <section className="table-panel">
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Hectare code, farmer or member no." value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="Canal"><select className="input-field" value={filters.canalId} onChange={(e) => setFilter('canalId', e.target.value)}><option value="">All canals</option>{opts.canals.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
          <Field label="Block"><select className="input-field" value={filters.blockId} onChange={(e) => setFilter('blockId', e.target.value)}><option value="">All blocks</option>{opts.blocks.map((b: any) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>
          <Field label="Allocation"><select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All</option><option value="AVAILABLE">Unallocated</option><option value="ALLOCATED">Allocated</option><option value="PENDING">Awaiting approval</option></select></Field>
        </Filters>
        {loading ? <TableSkeleton cols={6} rows={10} /> : !data?.data.length ? <Empty title="No hectare units match" hint="Hectare units appear when a block is created." /> : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Status</th><th>Current farmer</th><th>Guardian</th><th>Allocated</th><th /></tr></thead><tbody>
            {data.data.map((h: any) => (
              <tr key={h.id}>
                <td><Link href={`${BASE}/structure/hectares/${h.id}`} style={{ fontWeight: 600 }}>{farmId(h.code)}</Link></td>
                <td><StatusBadge value={h.allocationStatus} /></td>
                <td>{h.farmer ? <Link href={`${BASE}/allocation/farmers/${h.farmer.id}`}>{h.farmer.name} <span className="muted">· {h.farmer.memberNumber}</span></Link> : '—'}</td>
                <td>{h.guardian ? <Link href={`${BASE}/allocation/farmers/${h.guardian.id}`}>{h.guardian.name}</Link> : '—'}</td>
                <td>{fmtDate(h.allocatedOn)}</td>
                <td>{h.allocationStatus === 'AVAILABLE' && can('irrigation_allocations', 'CREATE') && <Link className="btn-secondary" href={`${BASE}/allocation/allocate?blockId=${h.block.id}&hectareId=${h.id}`}>Allocate</Link>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
    </>
  );
}
