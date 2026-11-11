'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the rest of the accounting screens */

import Link from 'next/link';
import { assetsApi } from '@/lib/api';
import ErrorBanner from '@/components/ErrorBanner';
import { Card, Head, shortDate, tzs, useLoad } from './controls';

const manage = <Link href="/dashboard/assets" className="btn-secondary">Open Assets to add or change equipment</Link>;

/** What the cooperative owns, at cost and net of depreciation — read straight from the assets register, the same figures the books carry. */
export function EquipmentRegisterView() {
  const list = useLoad<any>(() => assetsApi.list({ pageSize: 100 }), []);
  const t = list.data?.totals;
  const items: any[] = list.data?.items ?? [];
  return <div>
    <Head text="Every asset in the register, with what it cost, what has been written off so far and what it is worth now." action={manage} />
    <ErrorBanner message={list.error} onDismiss={() => list.setError()} />
    {t && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
      <Card label="Assets" value={String(t.count)} />
      <Card label="Cost" value={tzs(t.cost)} />
      <Card label="Depreciation to date" value={tzs(t.accumulatedDepreciation)} />
      <Card label="Net book value" value={tzs(t.bookValue)} tone="good" />
    </div>}
    <section className="table-panel">
      {list.loading && !list.data ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !items.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No assets have been registered.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Bought</th><th className="num">Cost</th><th className="num">Depreciation</th><th className="num">Book value</th><th>Status</th></tr></thead><tbody>
          {items.map((a) => <tr key={a.id}><td>{a.tag}</td><td>{a.name}</td><td>{String(a.category ?? '').replace(/_/g, ' ').toLowerCase()}</td><td>{shortDate(a.purchaseDate ?? a.depreciationStart)}</td>
            <td className="num">{tzs(a.cost)}</td><td className="num">{tzs(a.accumulatedDepreciation)}</td><td className="num">{tzs(a.bookValue)}</td><td>{String(a.status ?? '').replace(/_/g, ' ').toLowerCase()}</td></tr>)}
        </tbody></table></div>}
      {list.data && list.data.total > items.length && <div className="muted" style={{ padding: 12, fontSize: 13 }}>Showing the first {items.length} of {list.data.total}. Open Assets for the full list.</div>}
    </section>
  </div>;
}

/** The monthly depreciation journals that have been posted, newest first. */
export function DepreciationView() {
  const runs = useLoad<any[]>(() => assetsApi.depreciationRuns(), []);
  const rows = runs.data ?? [];
  return <div>
    <Head text="Each month's depreciation, as posted to the books (expense against accumulated depreciation). Run a new month from Assets." action={manage} />
    <ErrorBanner message={runs.error} onDismiss={() => runs.setError()} />
    <section className="table-panel">
      {runs.loading && !runs.data ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !rows.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No depreciation has been posted yet.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Month</th><th className="num">Assets</th><th className="num">Depreciation</th><th>Posted</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td>{r.period}</td><td className="num">{r.assets}</td><td className="num">{tzs(r.total)}</td><td>{shortDate(r.createdAt ?? r.postedAt)}</td></tr>)}
        </tbody></table></div>}
    </section>
  </div>;
}
