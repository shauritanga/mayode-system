'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import {
  BASE, CardsSkeleton, Empty, LoadError, MemberPicker, PageHeader, Panel, StatCard, StatusBadge, fmtDate, fmtHa, titleCase, useApi, useIrrigation, type MemberLite,
} from './ui';

/** Entry point for page 10 from the menu: pick a member, then open their profile. */
/** `bare` drops the page heading and opens the farmer's profile page instead of the irrigation one. */
export function FarmerSearch({ bare = false }: { bare?: boolean } = {}) {
  const { schemeId } = useIrrigation();
  const router = useRouter();
  const [member, setMember] = useState<MemberLite | null>(null);
  return (
    <>
      {!bare && <PageHeader title="Farmer / Hectare Details" subtitle="Look up a member to see their hectares, allocation history and related farm records." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Farmer / Hectare Details' }]} />}
      <Panel title="Find a member">
        <div style={{ maxWidth: 520 }}><MemberPicker schemeId={schemeId} value={member} onChange={(m) => { setMember(m); if (m) router.push(bare ? `/dashboard/farmers/${m.id}` : `${BASE}/allocation/farmers/${m.id}`); }} /></div>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>You can also open a farmer from any hectare, block or allocation list.</p>
      </Panel>
    </>
  );
}

/** Page 10 — a member's irrigation profile, with links across to hectares, blocks and canals. */
export function FarmerDetail({ farmerId }: { farmerId: string }) {
  const { data, loading, error, reload } = useApi<any>(() => irrigationApi.farmer(farmerId), [farmerId]);
  const f = data?.farmer;
  return (
    <>
      <PageHeader title={f?.name ?? 'Member'} subtitle={f ? `Member no. ${f.memberNumber}${f.mamcos ? ` · ${f.mamcos.name}` : ''}` : undefined}
        crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Farmer / Hectare Details', href: `${BASE}/allocation/farmers` }, { label: f?.name ?? '…' }]} />
      <LoadError message={error} onRetry={reload} />
      {loading || !data ? <CardsSkeleton count={4} /> : (
        <>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Active hectares" value={data.current.length} hint={fmtHa(data.totalActiveHectares)} />
            <StatCard label="Hectares guided" value={data.guided.current.length} hint="Registered to others" />
            <StatCard label="Awaiting approval" value={data.pending.length} />
            <StatCard label="Past allocations" value={data.history.length} />
            <StatCard label="Leadership roles" value={data.leadership.filter((l: any) => l.status === 'ACTIVE').length} />
          </div>
          <Panel title="Member information">
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: 0 }}>
              {[['Member number', f.memberNumber], ['Phone', f.phone ?? '—'], ['Email', f.email ?? '—'], ['Gender', titleCase(f.gender) || '—'], ['Village', f.village ?? '—'], ['Ward', f.ward ?? '—'], ['District', f.district ?? '—'], ['Region', f.region ?? '—'],
                ['Verification', titleCase(f.verificationStatus)], ['Member since', fmtDate(f.memberSince)]].map(([k, v]) => (
                <div key={String(k)}><dt className="muted" style={{ fontSize: 12 }}>{k}</dt><dd style={{ margin: '2px 0 0' }}>{v as any}</dd></div>))}
            </dl>
          </Panel>
          <Panel title="Assigned hectares" pad={false}>
            {!data.current.length && !data.pending.length ? <Empty title="No hectares assigned" hint="This member holds no hectare in the irrigation scheme." /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Block</th><th>Canal</th><th>Scheme</th><th>Since</th><th>Status</th><th>Guardian</th></tr></thead><tbody>
                {[...data.current, ...data.pending].map((a: any) => (
                  <tr key={a.id}><td><Link href={`${BASE}/structure/hectares/${a.hectare.id}`} style={{ fontWeight: 600 }}>{a.hectare.code}</Link></td><td><Link href={`${BASE}/structure/blocks/${a.block.id}`}>{a.block.code}</Link></td>
                    <td><Link href={`${BASE}/structure/canals/${a.canal.id}`}>{a.canal.code}</Link></td><td>{a.scheme.name}</td><td>{fmtDate(a.allocatedOn)}</td><td><StatusBadge value={a.status} /></td><td>{a.guardian ? <Link href={`${BASE}/allocation/farmers/${a.guardian.id}`}>{a.guardian.name}</Link> : '—'}</td></tr>
                ))}
              </tbody></table></div>
            )}
          </Panel>
          {(data.guided.current.length > 0 || data.guided.history.length > 0) && (
            <Panel title="Hectares guided by this member" pad={false}>
              <div className="muted" style={{ fontSize: 13, padding: '12px 16px 0' }}>Registered in other members&apos; names; this member is their guardian.</div>
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Registered to</th><th>Block</th><th>Canal</th><th>Since</th><th>Status</th></tr></thead><tbody>
                {[...data.guided.current, ...data.guided.history].map((g: any) => (
                  <tr key={g.id} style={g.endedOn ? { opacity: 0.6 } : undefined}>
                    <td><Link href={`${BASE}/structure/hectares/${g.hectare.id}`} style={{ fontWeight: 600 }}>{g.hectare.code}</Link></td>
                    <td><Link href={`${BASE}/allocation/farmers/${g.holder.id}`}>{g.holder.name}</Link> <span className="muted">· {g.holder.memberNumber}</span></td>
                    <td><Link href={`${BASE}/structure/blocks/${g.block.id}`}>{g.block.code}</Link></td><td><Link href={`${BASE}/structure/canals/${g.canal.id}`}>{g.canal.code}</Link></td>
                    <td>{fmtDate(g.startedOn)}</td>
                    <td>{g.endedOn ? <span className="muted">Ended {fmtDate(g.endedOn)} · {titleCase(String(g.endReason).replace(/^ENDED: /, '')) || '—'}</span> : <StatusBadge value="ACTIVE" />}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </Panel>
          )}
          <Panel title="Allocation history" pad={false}>
            {!data.history.length ? <Empty title="No past allocations" /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>From</th><th>To</th><th>Status</th><th>How it ended</th></tr></thead><tbody>
                {data.history.map((a: any) => <tr key={a.id}><td><Link href={`${BASE}/structure/hectares/${a.hectare.id}`}>{a.hectare.code}</Link></td><td>{fmtDate(a.allocatedOn)}</td><td>{fmtDate(a.endedOn)}</td><td><StatusBadge value={a.status} /></td><td>{a.endReason ?? '—'}</td></tr>)}
              </tbody></table></div>
            )}
          </Panel>
          {data.transfers.length > 0 && (
            <Panel title="Transfers" pad={false}>
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Direction</th><th>Other member</th><th>Effective</th><th>Status</th><th>Reason</th></tr></thead><tbody>
                {data.transfers.map((t: any) => <tr key={t.id}><td>{t.hectare.code}</td><td>{t.direction === 'IN' ? 'Received' : 'Handed over'}</td><td>{t.otherParty}</td><td>{fmtDate(t.effectiveDate)}</td><td><StatusBadge value={t.status} /></td><td>{t.reason}</td></tr>)}
              </tbody></table></div>
            </Panel>
          )}
          {data.leadership.length > 0 && (
            <Panel title="Leadership" pad={false}>
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Position</th><th>Canal / block</th><th>Term</th><th>Status</th></tr></thead><tbody>
                {data.leadership.map((l: any) => <tr key={l.id}><td>{titleCase(l.position)}</td><td>{l.block?.code ?? l.canal.code}</td><td>{fmtDate(l.termStart)} – {l.termEnd ? fmtDate(l.termEnd) : 'open'}</td><td><StatusBadge value={l.status} /></td></tr>)}
              </tbody></table></div>
            </Panel>
          )}
          <Panel title="Farms and agricultural records" pad={false}>
            {!data.farms.length && !data.cropCycles.length ? <Empty title="No farm or crop records" hint="Farm registrations and crop cycles for this member appear here." /> : (
              <>
                {data.farms.length > 0 && <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Farm</th><th>Canal</th><th>Block</th><th>Plot</th><th className="num">Hectares</th></tr></thead><tbody>
                  {data.farms.map((fm: any) => <tr key={fm.id}><td>{fm.farmCode} · {fm.name}</td><td>{fm.canal ?? '—'}</td><td>{fm.blockNumber ?? '—'}</td><td>{fm.plotNumber ?? '—'}</td><td className="num">{fm.socialHectares}</td></tr>)}
                </tbody></table></div>}
                {data.cropCycles.length > 0 && <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Season</th><th>Farm</th><th>Variety</th><th>Planted</th><th>Status</th></tr></thead><tbody>
                  {data.cropCycles.map((c: any) => <tr key={c.id}><td>{c.season}</td><td>{c.farm.farmCode}</td><td>{c.riceVariety ?? '—'}</td><td>{fmtDate(c.plantingDate)}</td><td><StatusBadge value={c.status} /></td></tr>)}
                </tbody></table></div>}
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
