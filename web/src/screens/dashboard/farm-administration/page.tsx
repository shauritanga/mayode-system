'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { farmDefaultsApi, harvestCollectionsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, TableSkeleton, Tabs, errMsg, fmtDate, fmtNum, useApi, useCan, useDebounced } from '@/screens/dashboard/irrigation/ui';

type Stage = 'open' | 'notice' | 'mlax' | 'resolved' | 'pending';
const STATUS_LABEL: Record<string, string> = { UNDER_AMCOS: 'Under AMCOS', MLAX_NOTICE: 'Last warning sent', AT_MLAX: 'On M-LAX', RECLAIMED: 'Debt paid, farms returned', TAKEN_OVER: 'Taken over by a farmer', LEASED_ON_MLAX: 'Leased on M-LAX', CLOSED: 'Released by the AMCOS' };
const EVENT_LABEL: Record<string, string> = { OPENED: 'Farms blocked', MLAX_NOTICE: 'Last warning: two days left', AT_MLAX: 'Listed on M-LAX', RECLAIMED: 'Debt paid, farms returned', TAKEN_OVER: 'Taken over by a farmer', RELEASED: 'Released by the AMCOS', LEASED_ON_MLAX: 'A farm was leased on M-LAX', PAID_TOO_LATE: 'Debt paid after the farms were on M-LAX' };
const money = (n: number) => `TZS ${fmtNum(n)}`;

/** Money waiting to be paid or collected that is not overdue debt: it never leads to M-LAX. */
function PendingPayments() {
  const { data, loading, error, reload } = useApi<any>(() => harvestCollectionsApi.pendingPayments(), []);
  const rows: any[] = data?.data ?? [];
  return (
    <section className="table-panel">
      <div style={{ padding: '10px 14px', fontSize: 13 }} className="muted">Combine harvest payments the leaders have not yet recorded, and unpaid harvest fees and contributions. Only the annual farm levy follows the overdue-debt steps above; these are followed up but never sent to M-LAX.</div>
      <LoadError message={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="Nothing pending" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>What</th><th>Who</th><th>Farm ID</th><th className="num">Amount</th><th>Waiting</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td>{r.what}<div className="muted" style={{ fontSize: 11 }}>{r.detail}</div></td><td>{r.who || '—'}</td><td>{r.farmIds?.join(', ') || '—'}</td>
              <td className="num">{money(r.amount)}</td><td><span className={`badge ${r.kind === 'HARVEST_PAYMENT' ? 'badge-gold' : 'badge-gray'}`}>{r.daysWaiting} day{r.daysWaiting === 1 ? '' : 's'}</span></td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </section>
  );
}

function left(deadline: string | null) {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Time is up';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h} h ${Math.floor((ms % 3_600_000) / 60_000)} min left` : `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}

/** Pick a farmer of the AMCOS from a searchable dropdown. */
function FarmerSelect({ value, onChange, exclude }: { value: any; onChange: (f: any) => void; exclude: string }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const [open, setOpen] = useState(false);
  const found = useApi<any>(open ? () => farmDefaultsApi.payers({ q: q || undefined, exclude }) : null, [q, open]);
  return (
    <Field label="Farmer who pays the debt *" hint="Click to see your farmers, or type to search by name, member number or phone">
      <div style={{ position: 'relative' }}>
        <input className="input-field" role="combobox" aria-controls="payer-list" aria-expanded={open} aria-autocomplete="list" autoComplete="off" placeholder="Choose a farmer"
          value={value && !open ? `${value.name} · ${value.memberNumber}` : text}
          onFocus={() => { setOpen(true); setText(''); }} onBlur={() => setOpen(false)}
          onChange={(e) => { setText(e.target.value); onChange(null); setOpen(true); }} />
        {open && (
          <div id="payer-list" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--surface-1, #fff)', border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 220, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
            {found.loading && !found.data ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>Loading…</div>
              : !found.data?.data.length ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>No matching farmers.</div>
              : found.data.data.map((m: any) => (
                <button key={m.id} type="button" role="option" aria-selected={value?.id === m.id} onMouseDown={(e) => { e.preventDefault(); onChange(m); setText(''); setOpen(false); }}
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'inherit' }}>
                  <span><strong>{m.name}</strong> <span className="muted">· {m.memberNumber}{m.village ? ` · ${m.village}` : ''}</span></span>
                  <span className="muted">{m.phone ?? 'no phone'}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </Field>
  );
}

function TakeOverDialog({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: (t: string) => void }) {
  const [payer, setPayer] = useState<any>(null);
  const [farmIds, setFarmIds] = useState<string[]>(c.farms.filter((f: any) => !f.isLeased).map((f: any) => f.id));
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!payer) { setError('Choose the farmer who pays'); return; }
    if (!farmIds.length) { setError('Choose at least one farm'); return; }
    setBusy(true); setError('');
    try { const res = await farmDefaultsApi.takeOver(c.id, { payerFarmerId: payer.id, farmIds, method, reference: reference.trim() || undefined }); onDone(`${payer.name} paid ${money(res.data.paid)} and farms the land in ${res.data.season}.`); }
    catch (e) { setError(errMsg(e, 'Could not record this.')); } finally { setBusy(false); }
  };
  return (
    <Modal title="A farmer pays the debt and farms the land" subtitle={`${c.farmer.name}'s debt: ${money(c.debt)}`} onClose={() => !busy && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : `Record payment of ${money(c.debt)}`}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>The whole overdue debt is paid at the AMCOS and recorded against {c.farmer.name}. The paying farmer then farms the chosen land this season. The owner&apos;s other farms come back, and the chosen ones return next season.</p>
        <FarmerSelect value={payer} onChange={setPayer} exclude={c.farmer.id} />
        <Field label="Farms the paying farmer takes">
          <div style={{ display: 'grid', gap: 6 }}>
            {c.farms.map((f: any) => (
              <label key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: f.isLeased ? 0.5 : 1 }}>
                <input type="checkbox" disabled={f.isLeased} checked={farmIds.includes(f.id)} onChange={(e) => setFarmIds((ids) => (e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id)))} />
                {f.name} · {f.farmCode} · {f.socialHectares} ha{f.isLeased ? ' (already leased)' : ''}
              </label>
            ))}
          </div>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Paid by"><select className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank</option></select></Field>
          <Field label="Reference"><input className="input-field" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or transaction number" /></Field>
        </div>
      </div>
    </Modal>
  );
}

function ReleaseDialog({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: (t: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reason.trim()) { setError('Say why the farms are being released'); return; }
    setBusy(true); setError('');
    try { await farmDefaultsApi.release(c.id, { reason: reason.trim() }); onDone(`${c.farmer.name}'s farms were released.`); }
    catch (e) { setError(errMsg(e, 'Could not release.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Release ${c.farmer.name}'s farms?`} subtitle="They go back to normal even though the debt is not paid." onClose={() => !busy && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Keep blocked</button><button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Release farms'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Reason *"><input className="input-field" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Payment plan agreed at the meeting" autoFocus /></Field>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>The same debt will not block the farms again. Only a debt that goes overdue later can. Farms already on M-LAX that are not yet leased are withdrawn.</p>
      </div>
    </Modal>
  );
}

function Detail({ c, onClose }: { c: any; onClose: () => void }) {
  return (
    <Modal title={c.farmer.name} subtitle={`${STATUS_LABEL[c.status]} · opened ${fmtDate(c.openedOn)}`} onClose={onClose} width="600px" footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <div style={{ display: 'grid', gap: 14, fontSize: 13 }}>
        <div><strong>Owes now:</strong> {money(c.debt)} {c.debtLines.length > 0 && <ul className="muted" style={{ margin: '4px 0 0 18px' }}>{c.debtLines.map((l: any) => <li key={l.dueId}>{l.description}: {money(l.balance)}</li>)}</ul>}</div>
        <div><strong>Farms</strong><ul style={{ margin: '4px 0 0 18px' }}>{c.farms.map((f: any) => <li key={f.id}>{f.name} · {f.farmCode} · {f.socialHectares} ha</li>)}</ul></div>
        {c.listings.length > 0 && <div><strong>On M-LAX</strong><ul style={{ margin: '4px 0 0 18px' }}>{c.listings.map((l: any) => <li key={l.id}>Minimum price {money(l.minimumPrice)} · {l.leaseStatus.toLowerCase().replace('_', ' ')}</li>)}</ul></div>}
        <div><strong>History</strong><ul className="muted" style={{ margin: '4px 0 0 18px' }}>{c.events.map((e: any) => <li key={e.id}>{fmtDate(e.createdAt)} · {EVENT_LABEL[e.kind] ?? e.kind}{e.note ? ` — ${e.note}` : ''}</li>)}</ul></div>
        <Link href={`/dashboard/farmers/${c.farmer.id}`} className="btn-secondary" style={{ justifySelf: 'start' }}>Open farmer</Link>
      </div>
    </Modal>
  );
}

/** Farms of farmers whose debt stayed unpaid past the grace period: blocked from leasing, run by the AMCOS, then possibly leased on M-LAX. */
export default function FarmAdministrationPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [stage, setStage] = useState<Stage>('open');
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'takeover' | 'release' | 'detail'; c: any } | null>(null);
  const [checking, setChecking] = useState(false);
  const list = useApi<any>(user?.mamcosId ? () => farmDefaultsApi.list({ stage: stage === 'pending' ? 'open' : stage }) : null, [stage, refresh, user?.mamcosId]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 7000); return () => clearTimeout(t); }, [notice]);

  if (!can('farm_administration', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the farms under administration permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Farms under administration" /><Empty title="This belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;

  const done = (text: string) => { setDialog(null); setNotice({ tone: 'success', text }); setRefresh((n) => n + 1); };
  const check = async () => {
    setChecking(true);
    try { const res = await farmDefaultsApi.check(); setNotice({ tone: 'success', text: res.data.opened ? `${res.data.opened} farmer(s) have a debt past its due date; their farms are now blocked.` : 'No new overdue debts.' }); setRefresh((n) => n + 1); }
    catch (e) { setNotice({ tone: 'error', text: errMsg(e, 'Could not check.') }); } finally { setChecking(false); }
  };
  const rows: any[] = list.data?.data ?? [];
  const counts = list.data?.counts ?? { open: 0, notice: 0, mlax: 0, resolved: 0 };
  const canEdit = can('farm_administration', 'EDIT');

  return (
    <div>
      <PageHeader title="Farms under administration" subtitle="When a farmer’s debt passes its due date, their farms are blocked from leasing and run by the AMCOS for the grace period. If the debt is still unpaid, the farms go to M-LAX and the farmer gets nothing from their lease."
        actions={can('farm_administration', 'CREATE') ? <button type="button" className="btn-secondary" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check now'}</button> : undefined} />
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      <LoadError message={list.error} onRetry={list.reload} />
      {list.data && !list.data.enabled && (
        <div className="glass-card" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--gold-400)' }}>
          <strong>This is switched off.</strong> Nobody is checked and no farm is blocked until you switch on the overdue-debt handling in <Link href="/dashboard/amcos-settings" style={{ textDecoration: 'underline' }}>Settings</Link>.
        </div>
      )}
      <Tabs tabs={[
        { id: 'open' as const, label: `Under AMCOS (${counts.open})` }, { id: 'notice' as const, label: `Last 2 days (${counts.notice})` },
        { id: 'mlax' as const, label: `On M-LAX (${counts.mlax})` }, { id: 'resolved' as const, label: `Resolved (${counts.resolved})` }, { id: 'pending' as const, label: 'Pending payments' },
      ]} active={stage} onChange={setStage} />
      {stage === 'pending' ? <PendingPayments /> : <section className="table-panel">
        {list.loading && !list.data ? <TableSkeleton cols={6} /> : !rows.length ? (
          <Empty title={stage === 'open' ? 'No farms under AMCOS administration' : 'Nothing here'}
            hint={stage === 'open' ? 'When a farmer’s debt passes its due date, their farms appear here.' : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Farmer</th><th>Farms</th><th className="num">Owes</th><th>{stage === 'resolved' ? 'Outcome' : stage === 'mlax' ? 'On M-LAX since' : 'Time left to pay'}</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><button type="button" onClick={() => setDialog({ kind: 'detail', c })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}><div style={{ fontWeight: 600 }}>{c.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{c.farmer.memberNumber}{c.farmer.phone ? ` · ${c.farmer.phone}` : ''}</div></button></td>
                    <td>{c.farms.map((f: any) => f.farmCode).join(', ') || '—'}</td>
                    <td className="num">{stage === 'resolved' ? '—' : money(c.debt)}</td>
                    <td>{stage === 'resolved' ? <>{STATUS_LABEL[c.status]}<div className="muted" style={{ fontSize: 11 }}>{c.resolvedNote}</div></> : stage === 'mlax' ? fmtDate(c.atMlaxAt) : <><strong>{left(c.graceEndsAt)}</strong>{c.daysOverdue != null && <div className="muted" style={{ fontSize: 11 }}>{c.daysOverdue} days overdue</div>}</>}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {canEdit && (c.status === 'UNDER_AMCOS' || c.status === 'MLAX_NOTICE') && <>
                        <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'takeover', c })}>Farmer pays &amp; farms</button>{' '}
                      </>}
                      {canEdit && ['UNDER_AMCOS', 'MLAX_NOTICE', 'AT_MLAX'].includes(c.status) && <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'release', c })}>Release</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}
      {dialog?.kind === 'detail' && <Detail c={dialog.c} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'takeover' && <TakeOverDialog c={dialog.c} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'release' && <ReleaseDialog c={dialog.c} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
