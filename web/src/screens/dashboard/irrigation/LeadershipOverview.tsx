'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import {
  BASE, CardsSkeleton, Empty, LoadError, PageHeader, Panel, ProgressBar, StatCard, StatusBadge, fmtDate, fmtNum, titleCase, useApi, useIrrigation,
} from './ui';

/** Page 12 — who leads what, and what is about to lapse. */
export default function LeadershipOverview() {
  const { schemeId, can, schemes, loading: schemesLoading } = useIrrigation();
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.leadershipOverview({ schemeId }) : null, [schemeId]);
  const t = data?.totals;
  return (
    <>
      <PageHeader title="Leadership Overview" subtitle="Canal and block leader coverage and upcoming appointment expirations." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Leadership Overview' }]}
        actions={can('irrigation_leadership', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/leadership/assignments`}>Appoint a leader</Link> : undefined} />
      <LoadError message={error} onRetry={reload} />
      {(!schemesLoading && !schemes.length) || (!loading && data && !data.scheme) ? (
        <Panel pad={false}><Empty title="No irrigation scheme has been registered yet" hint="Register the scheme and its canals and blocks first." action={can('irrigation', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/structure/scheme`}>Register scheme</Link> : undefined} /></Panel>
      ) : loading || !t ? <CardsSkeleton count={8} /> : (
        <>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Canals" value={fmtNum(t.canals)} /><StatCard label="Blocks" value={fmtNum(t.blocks)} />
            <StatCard label="Canal leaders assigned" value={fmtNum(t.assignedCanalLeaders)} />
            <StatCard label="Canals without a leader" value={fmtNum(t.unassignedCanals)} tone={t.unassignedCanals ? 'warn' : 'good'} />
            <StatCard label="Block leaders assigned" value={fmtNum(t.assignedBlockLeaders)} />
            <StatCard label="Blocks without a leader" value={fmtNum(t.blocksWithoutLeaders)} tone={t.blocksWithoutLeaders ? 'warn' : 'good'} />
            <StatCard label="Current appointments" value={fmtNum(t.currentAppointments)} />
            <StatCard label={`Expiring within ${data.windowDays} days`} value={fmtNum(data.expiring.length)} tone={data.expiring.length ? 'warn' : 'good'} />
          </div>
          <Panel title="Coverage by canal" pad={false}>
            {!data.coverage.length ? <Empty title="No canals yet" /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Canal</th><th>Canal leader</th><th className="num">Blocks</th><th className="num">With leader</th><th style={{ minWidth: 160 }}>Block coverage</th></tr></thead><tbody>
                {data.coverage.map((c: any) => (
                  <tr key={c.canalId}><td><Link href={`${BASE}/structure/canals/${c.canalId}`}>{c.code} · {c.name}</Link></td>
                    <td>{c.canalLeader ? <>{c.canalLeader.name}{c.canalLeader.state === 'TERM_EXPIRED' && <> <StatusBadge value="TERM_EXPIRED" label="Term expired" /></>}</> : <StatusBadge value="UNASSIGNED" label="No leader" />}</td>
                    <td className="num">{c.blocks}</td><td className="num">{c.blocksWithLeader}</td><td><ProgressBar pct={c.coveragePct} /><span className="muted" style={{ fontSize: 11 }}>{c.coveragePct}%</span></td></tr>
                ))}
              </tbody></table></div>
            )}
          </Panel>
          <Panel title="Upcoming expirations" pad={false}>
            {!data.expiring.length ? <Empty title="No appointments are expiring soon" /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Leader</th><th>Position</th><th>Canal / block</th><th>Term ends</th><th className="num">Days left</th></tr></thead><tbody>
                {data.expiring.map((a: any) => <tr key={a.id}><td>{a.leader.name} <span className="muted">· {a.leader.memberNumber}</span></td><td>{titleCase(a.position)}</td><td>{a.block?.code ?? a.canal.code}</td><td>{fmtDate(a.termEnd)}</td>
                  <td className="num">{a.daysLeft != null && a.daysLeft < 0 ? <StatusBadge value="TERM_EXPIRED" label={`Expired ${-a.daysLeft}d ago`} /> : a.daysLeft}</td></tr>)}
              </tbody></table></div>
            )}
          </Panel>
          <Panel title="Current appointments" pad={false}>
            {!data.appointments.length ? <Empty title="No current appointments" hint="Appoint canal and block leaders from Leader Assignments." /> : (
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Leader</th><th>Position</th><th>Canal / block</th><th>Term</th></tr></thead><tbody>
                {data.appointments.map((a: any) => <tr key={a.id}><td><Link href={`${BASE}/allocation/farmers/${a.leader.id}`}>{a.leader.name}</Link> <span className="muted">· {a.leader.memberNumber}</span></td><td>{titleCase(a.position)}</td><td>{a.block?.code ?? a.canal.code}</td><td>{fmtDate(a.termStart)} – {a.termEnd ? fmtDate(a.termEnd) : 'open'}</td></tr>)}
              </tbody></table></div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
