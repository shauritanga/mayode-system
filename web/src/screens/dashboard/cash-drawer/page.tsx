'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import { cashDrawerApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, errMsg, fmtDate, todayISO, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

function CloseDay({ onDone }: { onDone: (m: string) => void }) {
  const [day, setDay] = useState(todayISO());
  const t = useApi<any>(() => cashDrawerApi.today(day), [day]);
  const [counted, setCounted] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const d = t.data;
  const diff = counted === '' || !d ? 0 : Number(counted) - d.cash;
  const save = async () => {
    setBusy(true); setError('');
    try { await cashDrawerApi.close({ day, countedCash: Number(counted), note: note.trim() || undefined }); setCounted(''); setNote(''); t.reload(); onDone('Day closed. The Accountant can now receive it.'); }
    catch (e) { setError(errMsg(e, 'Could not close the day.')); } finally { setBusy(false); }
  };
  return (
    <div>
      <LoadError message={t.error} onRetry={t.reload} />
      <div style={{ maxWidth: 220, marginBottom: 12 }}><Field label="Day"><input type="date" className="input-field" value={day} max={todayISO()} onChange={(e) => setDay(e.target.value || todayISO())} /></Field></div>
      {d?.unclosedDays?.length > 0 && <Notice tone="error">You have collections on days you never closed: {d.unclosedDays.map(fmtDate).join(', ')}. Pick the day above and close it.</Notice>}
      {d && (
        <>
          <div className="metric-grid" style={{ marginBottom: 14 }}>
            <StatCard label="Cash you should hold" value={tzs(d.cash)} />
            <StatCard label="Mobile money" value={tzs(d.mobile)} hint="Already in the account" />
            <StatCard label="Bank" value={tzs(d.bank)} hint="Already in the account" />
            <StatCard label="Receipts" value={d.payments} />
          </div>
          {d.closed ? (
            <Notice tone="success">Closed. You counted {tzs(d.closed.countedCash)} against {tzs(d.closed.expectedCash)}{d.closed.variance ? ` (difference ${tzs(d.closed.variance)}${d.closed.note ? `: ${d.closed.note}` : ''})` : ''}. {d.closed.status === 'RECEIVED' ? 'The Accountant has received it.' : 'Waiting for the Accountant.'}</Notice>
          ) : (
            <section className="table-panel" style={{ padding: 16, maxWidth: 520 }}>
              <strong>Count the drawer</strong>
              <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>Count the cash in the drawer and enter it. Mobile money and bank are not counted.</div>
              {error && <Notice tone="error">{error}</Notice>}
              <div style={{ display: 'grid', gap: 10 }}>
                <Field label="Cash counted (TZS)"><input type="number" min={0} className="input-field" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
                {counted !== '' && <div style={{ fontSize: 13 }}>{diff === 0 ? <span className="badge badge-green">Matches</span> : <span className="badge badge-red">{diff < 0 ? 'Short' : 'Over'} by {tzs(Math.abs(diff))}</span>}</div>}
                {diff !== 0 && <Field label="Explain the difference *"><input className="input-field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
                <div><button type="button" className="btn-primary" disabled={busy || counted === ''} onClick={save}>{busy ? 'Closing…' : 'Close the day and send to the Accountant'}</button></div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Summaries({ canReceive }: { canReceive: boolean }) {
  const [status, setStatus] = useState('SUBMITTED'); const [refresh, setRefresh] = useState(0); const [rec, setRec] = useState<any>(null); const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => cashDrawerApi.list({ status }), [status, refresh]);
  const rows: any[] = data?.data ?? [];
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ marginBottom: 10 }}><select className="input-field" style={{ width: 230 }} aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="SUBMITTED">Waiting to be received</option><option value="RECEIVED">Received</option><option value="ALL">All</option></select></div>
      {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="No summaries here" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Day</th><th>Cashier</th><th className="num">Cash expected</th><th className="num">Counted</th><th className="num">Difference</th><th className="num">Mobile + bank</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.day)}</td><td>{r.cashier ?? '—'}</td><td className="num">{tzs(r.expectedCash)}</td><td className="num">{tzs(r.countedCash)}</td>
              <td className="num">{r.variance ? <span className="badge badge-red" title={r.note ?? ''}>{tzs(r.variance)}</span> : '—'}</td><td className="num">{tzs(r.expectedMobile + r.expectedBank)}</td>
              <td style={{ textAlign: 'right' }}>{r.status === 'RECEIVED' ? <span className="badge badge-green">Received</span> : canReceive && <button type="button" className="btn-primary" onClick={() => setRec(r)}>Receive</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {rec && <ConfirmDialog title="Receive this cash summary" confirmLabel="Receive" askReason={rec.variance !== 0} reasonLabel="What did you decide about the difference?"
        body={<>{fmtDate(rec.day)} · counted {tzs(rec.countedCash)} against {tzs(rec.expectedCash)}{rec.note ? `. The cashier says: ${rec.note}` : ''}. Confirm you have the cash.</>}
        onConfirm={async (reason) => { await cashDrawerApi.receive(rec.id, reason || undefined); setMsg('Received.'); setRefresh((n) => n + 1); }} onClose={() => setRec(null)} />}
    </div>
  );
}

/** The cashier's end-of-day cash count, sent to the Accountant to receive. */
export default function CashDrawerPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const [msg, setMsg] = useState('');
  if (!can('cash_drawer', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the cash drawer permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Cash Drawer" /><Empty title="The cash drawer belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  return (
    <div>
      <PageHeader title="Cash Drawer" subtitle="Close the day: the system adds up what you collected, you count the cash, and the Accountant receives the summary." />
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      {can('cash_drawer', 'CREATE') && <div style={{ marginBottom: 20 }}><CloseDay onDone={setMsg} /></div>}
      <h3 style={{ margin: '4px 0 10px' }}>Summaries</h3>
      <Summaries canReceive={can('cash_drawer', 'EDIT')} />
    </div>
  );
}
