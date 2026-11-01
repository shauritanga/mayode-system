'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { duesApi, irrigationApi, machineryApi } from '@/lib/api';
import { CardsSkeleton, Empty, LoadError, Panel, StatCard, StatusBadge, Tabs, fmtDate, fmtHa, titleCase, useApi, useIrrigation } from './ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
type Tab = 'activity' | 'payments' | 'charges' | 'history';
type Event = { at: string; kind: 'Allocation' | 'Guardian' | 'Transfer' | 'Work in block'; title: string; detail?: string };
const KIND_COLOR: Record<Event['kind'], string> = { Allocation: '#34D399', Guardian: '#A78BFA', Transfer: '#60A5FA', 'Work in block': '#F59E0B' };

/** One hectare: where it is, who holds it, what has happened on it, and what its holder has been charged and has paid. */
export function HectareDetail({ id }: { id: string }) {
  const { can } = useIrrigation();
  const [tab, setTab] = useState<Tab>('activity');
  const { data: h, loading, error, reload } = useApi<any>(() => irrigationApi.hectare(id), [id]);
  const holder = h?.farmer;
  // Charges belong to the farmer, not the hectare, so this is the current holder's account (a farmer holds one hectare here).
  const money = useApi<any>(holder && can('dues', 'VIEW') ? () => duesApi.statement(holder.id) : null, [holder?.id]);
  const work = useApi<any>(h && can('machinery', 'VIEW') ? () => machineryApi.activities({ blockId: h.block.id, pageSize: 20 }) : null, [h?.block?.id]);

  const events = useMemo<Event[]>(() => {
    if (!h) return [];
    const out: Event[] = [];
    for (const a of h.history ?? []) {
      const who = a.farmer.name;
      if (a.status === 'REJECTED') out.push({ at: a.allocatedOn, kind: 'Allocation', title: `Allocation to ${who} was rejected`, detail: a.rejectedReason ?? undefined });
      else {
        out.push({ at: a.allocatedOn, kind: 'Allocation', title: a.status === 'PENDING_APPROVAL' ? `Allocation to ${who} awaiting approval` : `Allocated to ${who}`, detail: a.notes ?? undefined });
        if (a.endedOn) out.push({ at: a.endedOn, kind: 'Allocation', title: `${who} released the hectare`, detail: a.endReason ?? undefined });
      }
      for (const g of a.guardians ?? []) {
        out.push({ at: g.startedOn, kind: 'Guardian', title: `${g.name} became guardian` });
        if (g.endedOn) out.push({ at: g.endedOn, kind: 'Guardian', title: `${g.name} stopped being guardian`, detail: g.endReason ?? undefined });
      }
    }
    for (const t of h.transfers ?? []) out.push({ at: t.effectiveDate, kind: 'Transfer', title: `${t.from ?? '—'} → ${t.to ?? '—'}`, detail: `${titleCase(t.status)} · ${t.reason}` });
    for (const w of work.data?.data ?? []) {
      out.push({ at: w.activityDate, kind: 'Work in block', title: `${titleCase(w.type)} · ${w.hectares} ha`, detail: [w.equipment?.name, w.feeAmount ? `fee ${tzs(w.feeAmount)} (${titleCase(w.feeStatus)})` : null].filter(Boolean).join(' · ') });
    }
    return out.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }, [h, work.data]);

  const dues: any[] = money.data?.dues ?? [];
  const payments = dues.flatMap((d) => (d.payments ?? []).filter((p: any) => !p.voidedAt).map((p: any) => ({ ...p, charge: d.description }))).sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));
  const canSeeMoney = can('dues', 'VIEW');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'activity', label: 'Activity' }, ...(canSeeMoney ? [{ id: 'payments' as Tab, label: 'Payments' }, { id: 'charges' as Tab, label: 'Charges' }] : []), { id: 'history', label: 'Allocation history' },
  ];
  const side = h?.block?.side ? `${titleCase(h.block.side)} side` : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: 12, marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Link href="/dashboard/scheme-structure" style={{ color: 'inherit', textDecoration: 'underline' }}>Scheme Structure</Link><span>/</span>
        <Link href="/dashboard/scheme-structure?tab=hectares" style={{ color: 'inherit', textDecoration: 'underline' }}>Hectare register</Link><span>/</span>
        <span>{h?.code ?? '…'}</span>
      </nav>
      <LoadError message={error} onRetry={reload} />
      {loading || !h ? <CardsSkeleton count={3} /> : (
        <>
          <section className="table-panel" style={{ padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hectare</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                  <h1 style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 30, fontWeight: 800 }}>{h.code}</h1>
                  <StatusBadge value={h.allocationStatus} />
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  <Link href={`/dashboard/irrigation/structure/canals/${h.canal.id}`}>{h.canal.name}</Link> · <Link href={`/dashboard/irrigation/structure/blocks/${h.block.id}`}>Block {h.block.code}</Link>{side ? ` · ${side}` : ''} · {fmtHa(h.areaHectares)}
                </div>
              </div>
              <div style={{ minWidth: 240 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Held by</div>
                {holder ? (
                  <>
                    <Link href={`/dashboard/farmers/${holder.id}`} style={{ fontSize: 18, fontWeight: 700 }}>{holder.name}</Link>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>ID {holder.memberNumber}{h.allocatedOn ? ` · since ${fmtDate(h.allocatedOn)}` : ''}</div>
                    {h.guardian && <div style={{ fontSize: 12.5, marginTop: 4 }}>Guardian: <Link href={`/dashboard/farmers/${h.guardian.id}`}>{h.guardian.name}</Link></div>}
                  </>
                ) : <div style={{ fontSize: 15, marginTop: 2 }}>Nobody yet</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {h.allocationStatus === 'AVAILABLE' && can('irrigation_allocations', 'CREATE') && <Link className="btn-primary" href={`/dashboard/plot-allocation?tab=allocate&blockId=${h.block.id}&hectareId=${h.id}`}>Allocate</Link>}
              {h.allocationStatus === 'ALLOCATED' && can('irrigation_allocations', 'CREATE') && <Link className="btn-secondary" href={`/dashboard/plot-allocation?tab=transfers&add=1&hectareId=${h.id}`}>Transfer</Link>}
            </div>
          </section>

          {holder && canSeeMoney && (
            <div className="metric-grid" style={{ marginBottom: 16 }}>
              <StatCard label={`Charged to ${holder.name.split(' ')[0]}`} value={tzs(money.data?.totals?.charged)} />
              <StatCard label="Paid" value={tzs(money.data?.totals?.paid)} tone="good" />
              <StatCard label="Balance" value={tzs(money.data?.totals?.outstanding)} tone={money.data?.totals?.outstanding ? 'warn' : 'good'} />
            </div>
          )}

          <Tabs tabs={tabs} active={tab} onChange={setTab} />

          {tab === 'activity' && (
            <Panel pad={false}>
              {!events.length ? <Empty title="Nothing has happened here yet" hint="Allocations, transfers, guardians and work in this block appear here." /> : (
                <ol style={{ listStyle: 'none', margin: 0, padding: '8px 20px' }}>
                  {events.map((e, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--border-subtle)' : undefined, alignItems: 'start' }}>
                      <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: KIND_COLOR[e.kind], marginTop: 5 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{e.title}</div>
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{e.kind}{e.detail ? ` · ${e.detail}` : ''}</div>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(e.at)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}

          {tab === 'payments' && (
            <Panel pad={false}>
              {!holder ? <Empty title="No holder" hint="Payments are shown for the farmer who holds this hectare." />
                : money.loading ? <div style={{ padding: 16 }}><CardsSkeleton count={1} /></div>
                : !payments.length ? <Empty title="No payments yet" hint={`${holder.name} has not paid any AMCOS charge.`} />
                : (
                  <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Receipt</th><th>For</th><th>Method</th><th className="num">Amount</th></tr></thead><tbody>
                    {payments.map((p: any) => <tr key={p.id}><td>{fmtDate(p.paidOn)}</td><td style={{ fontWeight: 600 }}>{p.receiptNo}</td><td>{p.charge}</td><td>{titleCase(p.method)}</td><td className="num">{tzs(p.amount)}</td></tr>)}
                  </tbody></table></div>
                )}
            </Panel>
          )}

          {tab === 'charges' && (
            <Panel pad={false}>
              {!holder ? <Empty title="No holder" hint="Charges are shown for the farmer who holds this hectare." />
                : money.loading ? <div style={{ padding: 16 }}><CardsSkeleton count={1} /></div>
                : !dues.length ? <Empty title="No charges" hint={`${holder.name} has nothing charged.`} />
                : (
                  <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Charge</th><th>Issued</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th></tr></thead><tbody>
                    {dues.map((d: any) => <tr key={d.id}><td>{d.description}</td><td>{fmtDate(d.issuedOn)}</td><td>{d.dueDate ? fmtDate(d.dueDate) : '—'}</td><td className="num">{tzs(d.amount)}</td><td className="num">{tzs(d.paid)}</td><td className="num">{tzs(d.balance)}</td><td><StatusBadge value={d.overdue ? 'OVERDUE' : d.state} /></td></tr>)}
                  </tbody></table></div>
                )}
            </Panel>
          )}

          {tab === 'history' && (
            <Panel pad={false}>
              {!h.history.length ? <Empty title="This hectare has never been allocated" /> : (
                <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Farmer</th><th>Status</th><th>From</th><th>To</th><th>How it ended</th><th>Requested by</th><th>Approved by</th></tr></thead><tbody>
                  {h.history.map((a: any) => (
                    <tr key={a.id}><td><Link href={`/dashboard/farmers/${a.farmer.id}`}>{a.farmer.name}</Link> <span className="muted">· {a.farmer.memberNumber}</span></td>
                      <td><StatusBadge value={a.status} /></td><td>{fmtDate(a.allocatedOn)}</td><td>{fmtDate(a.endedOn)}</td>
                      <td>{a.endReason ?? a.rejectedReason ?? '—'}</td><td>{a.requestedBy ?? '—'}</td><td>{a.approvedBy ?? '—'}</td></tr>
                  ))}
                </tbody></table></div>
              )}
            </Panel>
          )}
        </>
      )}
    </>
  );
}
