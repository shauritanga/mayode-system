'use client';

import { useMemo, useState } from 'react';
import { Empty, LoadError, Panel, StatCard, StatusBadge, fmtDate } from '@/screens/dashboard/irrigation/ui';
import { printPage } from '@/lib/print';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const KINDS: { id: string; label: string; match: string[] }[] = [
  { id: 'ALL', label: 'Everything', match: [] },
  { id: 'CHARGE', label: 'Charges', match: ['CHARGE', 'WAIVER'] },
  { id: 'PAYMENT', label: 'Payments', match: ['PAYMENT'] },
  { id: 'COMBINE', label: 'Combine harvest', match: ['COMBINE'] },
  { id: 'INPUTS', label: 'Inputs', match: ['INPUTS'] },
];
const KIND_LABEL: Record<string, string> = { CHARGE: 'Charge', PAYMENT: 'Payment', WAIVER: 'Waived', COMBINE: 'Combine', INPUTS: 'Inputs' };

/** A farmer's or a farm's whole account: totals, the balance of each farm, and every charge, payment, combine harvest and input given. */
export default function AccountHistory({ data, loading, error, onRetry, title = 'Transactions & balance', farmerLink = false }: {
  data: any; loading: boolean; error: string; onRetry: () => void; title?: string; farmerLink?: boolean;
}) {
  const [kind, setKind] = useState('ALL');
  const entries: any[] = data?.entries ?? [];
  const shown = useMemo(() => {
    const k = KINDS.find((x) => x.id === kind);
    return !k || !k.match.length ? entries : entries.filter((e) => k.match.includes(e.kind));
  }, [entries, kind]);
  const t = data?.totals;
  const farms: any[] = data?.farms ?? [];

  return (
    <Panel title={title} pad={false} actions={<button type="button" className="btn-secondary" onClick={printPage}>Print</button>}>
      <LoadError message={error} onRetry={onRetry} />
      {loading && !data ? <div style={{ padding: 16 }} className="muted">Loading…</div> : !data ? null : (
        <>
          <div className="metric-grid" style={{ padding: 16 }}>
            <StatCard label="Charged" value={tzs(t?.charged)} />
            <StatCard label="Paid" value={tzs(t?.paid)} tone="good" />
            <StatCard label="Still owed" value={tzs(t?.outstanding)} tone={t?.outstanding > 0 ? 'warn' : 'good'} />
            <StatCard label="Overdue" value={tzs(t?.overdue)} tone={t?.overdue > 0 ? 'warn' : 'good'} />
          </div>
          {farms.length > 1 || (farms.length === 1 && farms[0].farmId == null) ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table"><thead><tr><th>Farm</th><th className="num">Charged</th><th className="num">Paid</th><th className="num">Still owed</th></tr></thead><tbody>
                {farms.map((f) => (
                  <tr key={f.farmId ?? 'none'}>
                    <td style={{ fontWeight: 600 }}>{f.farmId ?? <span className="muted">Not tied to a farm</span>}</td>
                    <td className="num">{tzs(f.charged)}</td><td className="num">{tzs(f.paid)}</td><td className="num">{tzs(f.outstanding)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 16px' }}>
            {KINDS.map((k) => (
              <button key={k.id} type="button" className={kind === k.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
          </div>
          {!shown.length ? <Empty title="Nothing recorded yet" hint="Charges, payments, combine harvests and inputs for this account will appear here." /> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>What</th><th>Farm</th><th>Receipt / ref.</th><th className="num">Charged</th><th className="num">Paid</th><th>Status</th></tr></thead><tbody>
                {shown.map((e) => (
                  <tr key={e.id} style={e.voided ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                    <td>{fmtDate(e.date)}</td>
                    <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td>{e.title}{e.detail ? <div className="muted" style={{ fontSize: 12 }}>{e.detail}</div> : null}{farmerLink && e.farmerName ? <div className="muted" style={{ fontSize: 12 }}>{e.farmerName}</div> : null}</td>
                    <td>{e.farmId ?? '—'}</td>
                    <td>{e.reference ?? '—'}</td>
                    <td className="num">{e.charged ? tzs(e.charged) : e.info != null && e.kind !== 'PAYMENT' && !e.paid ? <span className="muted" title="For information: this does not change the balance">{tzs(e.info)}</span> : '—'}</td>
                    <td className="num">{e.paid ? tzs(e.paid) : e.info != null && e.kind === 'PAYMENT' ? <span className="muted">{tzs(e.info)}</span> : '—'}</td>
                    <td><StatusBadge value={String(e.status).split(' ')[0]} /></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, padding: '10px 16px' }}>
            Grey amounts are for information (combine payments and inputs handed over); they do not change the balance. Each charge and receipt is split between the farmer&apos;s farms when it is created; older ones show as not tied to a farm.
          </div>
        </>
      )}
    </Panel>
  );
}
