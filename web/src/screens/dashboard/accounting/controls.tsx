'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the rest of the accounting screens */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { accountingApi, suppliersApi } from '@/lib/api';
import Modal from '@/components/Modal';
import ErrorBanner from '@/components/ErrorBanner';
import MoneyInput from '@/components/MoneyInput';

export const tzs = (n: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(Number(n) || 0);
export const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
export const errText = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || e?.message || fallback;
};
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const lastMonthEnd = () => { const n = new Date(Date.now() + 3 * 3_600_000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)).toISOString().slice(0, 10); };
export const shortDate = (v?: string | null) => { if (!v) return '—'; const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v); };

export function useLoad<T>(load: () => Promise<{ data: T }>, deps: unknown[]) {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const [dismissed, setDismissed] = useState('');
  const key = `${JSON.stringify(deps)}#${tick}`;
  useEffect(() => {
    let live = true;
    load().then((r) => { if (live) setRes({ key, data: r.data }); }).catch((e) => { if (live) setRes({ key, error: errText(e, 'Could not load this page.') }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads when the caller's inputs (deps) or an explicit reload change
  }, [key]);
  return {
    data: res?.data ?? null,
    loading: res?.key !== key,
    error: res?.key === key && res.error && dismissed !== key ? res.error : '',
    setError: (...args: [string?]) => { void args; setDismissed(key); },
    reload: () => setTick((t) => t + 1),
  };
}

export function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return <div className="glass-card" style={{ padding: 16 }}>
    <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    <strong style={{ display: 'block', marginTop: 6, fontSize: 20, color: tone === 'bad' ? 'var(--red-400)' : tone === 'good' ? 'var(--green-400, #4ade80)' : undefined }}>{value}</strong>
    {hint && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}
  </div>;
}
/** Slim action row. The page already shows the title, so this carries only an optional one-line hint and the page's main action. */
export function Head({ text, action }: { title?: string; text?: string; action?: React.ReactNode }) {
  if (!text && !action) return null;
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
    <span className="muted" style={{ fontSize: 13 }}>{text}</span>{action}
  </div>;
}
export function Badge({ children, tone }: { children: React.ReactNode; tone: 'good' | 'warn' | 'bad' | 'muted' }) {
  const color = { good: '#4ade80', warn: '#fbbf24', bad: '#f87171', muted: 'var(--muted, #9ca3af)' }[tone];
  return <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, border: `1px solid ${color}`, color }}>{children}</span>;
}
export function Actions({ cancel, label, form, busy, onCancel }: { cancel?: boolean; label: string; form: string; busy: boolean; onCancel: () => void }) {
  return <>{cancel !== false && <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>}<button type="submit" form={form} className="btn-primary" disabled={busy}>{busy ? 'Working…' : label}</button></>;
}

export const KIND_WORDS: Record<string, string> = { CASH: 'Cash box', BANK: 'Bank account', MOBILE_MONEY: 'Mobile money' };

/** A "Paid from / Received into" picker used on every screen that moves money. Empty means the default account of that kind, or not assigned. */
export function MoneyAccountSelect({ value, onChange, label = 'Money account', hint, defaultKind = 'CASH' }: { value: string; onChange: (id: string) => void; label?: string; hint?: string; defaultKind?: 'CASH' | 'BANK' | 'MOBILE_MONEY' }) {
  const accounts = useLoad<any>(() => accountingApi.cashAccounts(), []);
  const items: any[] = accounts.data?.items ?? [];
  const fallback = items.find((a) => a.kind === defaultKind && a.isDefault);
  return (
    <label className="form-label">{label}
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{fallback ? `${fallback.name} (default)` : 'Not assigned to an account'}</option>
        {items.filter((a) => a.id !== fallback?.id).map((a) => <option key={a.id} value={a.id}>{a.name} · {KIND_WORDS[a.kind]}</option>)}
      </select>
      {(hint || items.length === 0) && <span className="muted" style={{ fontSize: 11 }}>{items.length === 0 ? 'No money accounts yet. Add them in Cash & banking → Money Accounts.' : hint}</span>}
    </label>
  );
}

// ───────────────────────── Closing the books ─────────────────────────
export function PeriodCloseView({ canClose, canReopen }: { canClose: boolean; canReopen: boolean }) {
  const lock = useLoad<any>(() => accountingApi.periodLock(), []);
  const closed: string | null = lock.data?.closedThrough ?? null;
  const [month, setMonth] = useState(lastMonthEnd().slice(0, 7));
  const through = month ? monthEnd(month) : '';
  const check = useLoad<any>(() => (through && canClose ? accountingApi.periodLockCheck(through) : Promise.resolve({ data: null })), [through, canClose, closed]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reopen, setReopen] = useState(false);
  const [reopenTo, setReopenTo] = useState('');
  const [reason, setReason] = useState('');
  const mustAdvance = !!closed && through <= closed;

  const close = async () => {
    if (!window.confirm(`Close the books through ${shortDate(through)}? Nothing can then be posted on or before that date until it is reopened.`)) return;
    setBusy(true); setErr('');
    try { await accountingApi.closeBooks(through); lock.reload(); } catch (e) { setErr(errText(e, 'Could not close the books.')); } finally { setBusy(false); }
  };
  const doReopen = async () => {
    setBusy(true); setErr('');
    try { await accountingApi.reopenBooks({ to: reopenTo ? monthEnd(reopenTo) : undefined, reason }); setReopen(false); setReason(''); setReopenTo(''); lock.reload(); } catch (e) { setErr(errText(e, 'Could not reopen the books.')); } finally { setBusy(false); }
  };
  return <div>
    <Head text="Closed months are locked: late entries are dated on the first open day." />
    <ErrorBanner message={lock.error || err} onDismiss={() => { lock.setError(''); setErr(''); }} />
    <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><div className="muted" style={{ fontSize: 12 }}>Books closed through</div><strong style={{ fontSize: 20 }}>{closed ? shortDate(closed) : 'Not closed'}</strong></div>
        {canReopen && closed && <button type="button" className="btn-secondary" onClick={() => { setErr(''); setReopen(true); }}>Reopen…</button>}
      </div>
      {canClose && <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="form-label">Close through<input className="input-field" type="month" value={month} max={lastMonthEnd().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></label>
        <button type="button" className="btn-primary" onClick={() => void close()} disabled={busy || !through || mustAdvance || !check.data?.balanced}>Close {through ? shortDate(through) : '…'}</button>
        {check.data && (check.data.balanced ? <Badge tone="good">Books balance</Badge> : <Badge tone="bad">Out of balance by {tzs(check.data.difference)}</Badge>)}
      </div>}
      {mustAdvance && <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>Already closed through {shortDate(closed)}. Choose a later month.</div>}
      {check.data?.warnings?.length > 0 && <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: '#fbbf24' }}>{check.data.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}
    </section>
    <section className="table-panel"><div className="section-toolbar"><strong>Close history</strong></div>
      {!lock.data?.events?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No closings yet.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>When</th><th>Action</th><th>From</th><th>To</th><th>By</th><th>Reason</th></tr></thead><tbody>
          {lock.data.events.map((e: any) => <tr key={e.id}><td>{shortDate(e.createdAt)}</td><td>{e.action === 'CLOSE' ? 'Closed' : 'Reopened'}</td><td>{shortDate(e.fromDate)}</td><td>{e.toDate ? shortDate(e.toDate) : 'Fully open'}</td><td>{e.by ?? '—'}</td><td>{e.reason ?? '—'}</td></tr>)}
        </tbody></table></div>}
    </section>
    {reopen && <Modal title="Reopen the books" onClose={() => !busy && setReopen(false)} width="520px" footer={<Actions label="Reopen" form="reopen-form" busy={busy} onCancel={() => setReopen(false)} />}>
      <form id="reopen-form" onSubmit={(e) => { e.preventDefault(); void doReopen(); }} style={{ display: 'grid', gap: 10 }}>
        <label className="form-label">Reopen back to the end of (leave empty to reopen everything)<input className="input-field" type="month" value={reopenTo} onChange={(e) => setReopenTo(e.target.value)} /></label>
        <label className="form-label">Reason<textarea className="input-field" required minLength={10} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why must this period be changed?" /></label>
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}
  </div>;
}

// ───────────────────────── Bank / mobile-money reconciliation ─────────────────────────
function parseLines(text: string): { date: string; description: string; amount: number; reference?: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((raw, i) => {
    const parts = raw.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ''));
    if (i === 0 && !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return null; // header row
    const amount = Number((parts[parts.length - 1] ?? '').replace(/[\s,]/g, ''));
    const desc = parts.slice(1, parts.length - 1).join(' ');
    return /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) && parts.length >= 3 && Number.isFinite(amount) && amount !== 0 ? { date: parts[0], description: desc || 'Statement line', amount } : { date: '', description: raw, amount: NaN };
  }).filter(Boolean) as any;
}

export function BankReconciliationView({ canCreate, canEdit, canDelete }: { canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const summary = useLoad<any>(() => accountingApi.reconciliationSummary(), []);
  const list = useLoad<any[]>(() => accountingApi.bankStatements(), []);
  const [newOpen, setNewOpen] = useState(false);
  const reloadAll = () => { summary.reload(); list.reload(); };
  if (openId) return <StatementDetail id={openId} canEdit={canEdit} canDelete={canDelete} onBack={() => { setOpenId(null); reloadAll(); }} />;
  const s = summary.data;
  return <div>
    <Head action={canCreate && <button type="button" className="btn-primary" onClick={() => setNewOpen(true)}>New statement</button>} />
    <ErrorBanner message={summary.error || list.error} onDismiss={() => { summary.setError(''); list.setError(''); }} />
    {s && <div className="metric-grid" style={{ marginBottom: 16 }}>
      <Card label="Cash book" value={tzs(s.ledgerBalance)} />
      <Card label="Statements" value={s.hasStatements ? tzs(s.statementsTotal) : '—'} hint={s.hasStatements ? undefined : 'None added yet'} />
      <Card label="Difference" value={s.hasStatements ? tzs(s.difference) : '—'} tone={!s.hasStatements ? undefined : s.reconciled ? 'good' : 'bad'}
        hint={s.hasStatements ? (s.reconciled ? 'Agrees' : `Not in books ${tzs(s.unmatchedLinesNet)} · not on statement ${tzs(s.unmatchedLedgerNet)}`) : undefined} />
    </div>}
    {s?.byAccount?.length > 0 && <section className="table-panel" style={{ marginBottom: 16 }}><div className="section-toolbar"><strong>Each account against its statement</strong></div>
      <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account</th><th className="num">In your books</th><th className="num">On the latest statement</th><th className="num">Difference</th><th /></tr></thead><tbody>
        {s.byAccount.map((a: any) => <tr key={a.id}><td><strong>{a.name}</strong><div className="muted" style={{ fontSize: 12 }}>{KIND_WORDS[a.kind]}</div></td>
          <td className="num">{tzs(a.books)}</td><td className="num">{a.statement == null ? '—' : tzs(a.statement)}</td>
          <td className="num">{a.difference == null ? '—' : tzs(a.difference)}</td>
          <td>{a.statement == null ? <span className="muted">No statement yet</span> : Math.abs(a.difference) < 0.005 ? <Badge tone="good">Agrees</Badge> : <Badge tone="bad">Needs checking</Badge>}</td></tr>)}
      </tbody></table></div>
    </section>}
    <section className="table-panel"><div className="section-toolbar"><strong>Statements</strong></div>
      {list.loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !list.data?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No statements yet. Add one to start reconciling.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account</th><th>Period</th><th className="num">Opening</th><th className="num">Closing</th><th>Lines</th><th>Status</th><th /></tr></thead><tbody>
          {list.data.map((st: any) => <tr key={st.id}><td>{st.accountLabel}<div className="muted" style={{ fontSize: 12 }}>{st.kind.replace('_', ' ').toLowerCase()}</div></td><td>{shortDate(st.periodStart)} – {shortDate(st.periodEnd)}</td><td className="num">{tzs(st.openingBalance)}</td><td className="num">{tzs(st.closingBalance)}</td>
            <td>{st.lineCount}{st.unmatched ? <span className="muted"> · {st.unmatched} unmatched</span> : null}</td>
            <td>{st.status === 'RECONCILED' ? <Badge tone="good">Reconciled</Badge> : st.arithmeticDifference ? <Badge tone="bad">Lines don’t add up</Badge> : <Badge tone="warn">In progress</Badge>}</td>
            <td><button type="button" className="btn-secondary" onClick={() => setOpenId(st.id)}>Open</button></td></tr>)}
        </tbody></table></div>}
    </section>
    {s?.unmatchedLedger?.length > 0 && <section className="table-panel" style={{ marginTop: 16 }}><div className="section-toolbar"><strong>Cash-book entries not on any statement</strong><span className="muted">{s.unmatchedLedger.length}</span></div>
      <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th className="num">Amount</th></tr></thead><tbody>
        {s.unmatchedLedger.map((e: any) => <tr key={e.id}><td>{shortDate(e.date)}</td><td>{e.entryNumber}</td><td>{e.description ?? '—'}</td><td className="num">{tzs(e.amount)}</td></tr>)}
      </tbody></table></div></section>}
    {newOpen && <NewStatementModal onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); setOpenId(id); }} />}
  </div>;
}

/** Picks the money account a statement is for; the free-text name and type are only for an account not set up in Money Accounts. */
function StatementAccount({ value, label, kind, onChange }: { value: string; label: string; kind: string; onChange: (patch: { cashAccountId?: string; accountLabel?: string; kind?: string }) => void }) {
  const accounts = useLoad<any>(() => accountingApi.cashAccounts(), []);
  const items: any[] = (accounts.data?.items ?? []).filter((a: any) => a.kind !== 'CASH');
  return <div style={{ display: 'grid', gap: 10 }}>
    <label className="form-label">Which account is this statement for?
      <select className="input-field" value={value} onChange={(e) => onChange({ cashAccountId: e.target.value })}>
        <option value="">{items.length ? 'Another account (type its name)' : 'Type the account name'}</option>
        {items.map((a) => <option key={a.id} value={a.id}>{a.name} · {KIND_WORDS[a.kind]}</option>)}
      </select>
      {items.length === 0 && <span className="muted" style={{ fontSize: 11 }}>Add your bank accounts and wallets in Money Accounts so each statement is checked against the right account.</span>}
    </label>
    {!value && <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
      <label className="form-label">Account name<input className="input-field" required value={label} onChange={(e) => onChange({ accountLabel: e.target.value })} placeholder="e.g. CRDB 0150… or M-Pesa till" /></label>
      <label className="form-label">Type<select className="input-field" value={kind} onChange={(e) => onChange({ kind: e.target.value })}><option value="BANK">Bank</option><option value="MOBILE_MONEY">Mobile money</option><option value="CASH">Cash</option></select></label>
    </div>}
  </div>;
}

function NewStatementModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ cashAccountId: '', accountLabel: '', kind: 'BANK', periodStart: `${today().slice(0, 8)}01`, periodEnd: today(), openingBalance: '', closingBalance: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const parsed = useMemo(() => parseLines(f.text), [f.text]);
  const bad = parsed.filter((l) => !l.date || !Number.isFinite(l.amount));
  const submit = async () => {
    if (bad.length) { setErr(`${bad.length} line${bad.length > 1 ? 's' : ''} could not be read. Use: date (YYYY-MM-DD), description, amount.`); return; }
    setBusy(true); setErr('');
    try {
      const r = await accountingApi.createBankStatement({ cashAccountId: f.cashAccountId || undefined, accountLabel: f.cashAccountId ? undefined : f.accountLabel, kind: f.kind, periodStart: f.periodStart, periodEnd: f.periodEnd, openingBalance: Number(f.openingBalance), closingBalance: Number(f.closingBalance), lines: parsed });
      onCreated(r.data.id);
    } catch (e) { setErr(errText(e, 'Could not save the statement.')); } finally { setBusy(false); }
  };
  const readFile = (file?: File | null) => { if (file) void file.text().then((t) => setF((p) => ({ ...p, text: t }))); };
  return <Modal title="New statement" onClose={() => !busy && onClose()} width="720px" footer={<Actions label="Save and match" form="stmt-form" busy={busy} onCancel={onClose} />}>
    <form id="stmt-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
      <StatementAccount value={f.cashAccountId} label={f.accountLabel} kind={f.kind} onChange={(patch) => setF({ ...f, ...patch })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <label className="form-label">From<input className="input-field" type="date" required value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></label>
        <label className="form-label">To<input className="input-field" type="date" required value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></label>
        <label className="form-label">Opening balance<MoneyInput className="input-field" step="0.01" required value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} /></label>
        <label className="form-label">Closing balance<MoneyInput className="input-field" step="0.01" required value={f.closingBalance} onChange={(e) => setF({ ...f, closingBalance: e.target.value })} /></label>
      </div>
      <label className="form-label">Statement lines — one per row: date, description, amount (money out is negative)
        <textarea className="input-field" rows={8} required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={'2026-10-03, Deposit from rice sale, 1500000\n2026-10-05, Bank charges, -5000'} style={{ fontFamily: 'monospace' }} />
      </label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
        <label className="btn-secondary" style={{ cursor: 'pointer' }}>Load from CSV file<input type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => readFile(e.target.files?.[0])} /></label>
        <span className="muted">{parsed.length - bad.length} line{parsed.length - bad.length === 1 ? '' : 's'} read{bad.length ? `, ${bad.length} unreadable` : ''}</span>
      </div>
      {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
    </form>
  </Modal>;
}

function StatementDetail({ id, canEdit, canDelete, onBack }: { id: string; canEdit: boolean; canDelete: boolean; onBack: () => void }) {
  const d = useLoad<any>(() => accountingApi.bankStatement(id), [id]);
  const accounts = useLoad<any[]>(() => accountingApi.accounts(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [adjust, setAdjust] = useState<any>(null);
  const [acct, setAcct] = useState('');
  const run = async (fn: () => Promise<any>, after?: () => void) => {
    setBusy(true); setErr('');
    try { await fn(); d.reload(); after?.(); } catch (e) { setErr(errText(e, 'That did not work.')); } finally { setBusy(false); }
  };
  const st = d.data;
  const draft = st?.status === 'DRAFT';
  return <div>
    <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: 12, marginBottom: 14, display: 'flex', gap: 6 }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Bank Reconciliation</button><span>/</span><span>{st?.accountLabel ?? 'Statement'}</span>
    </nav>
    <ErrorBanner message={d.error || err} onDismiss={() => { d.setError(''); setErr(''); }} />
    {st && <>
      <Head text={`${st.accountLabel} · ${shortDate(st.periodStart)} – ${shortDate(st.periodEnd)}${st.status === 'RECONCILED' ? ' · reconciled' : ''}`} action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {draft && canEdit && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => accountingApi.autoMatchStatement(id))}>Auto-match</button>}
          {draft && canEdit && <button type="button" className="btn-primary" disabled={busy || st.unmatchedLines > 0 || st.arithmeticDifference !== 0} onClick={() => void run(() => accountingApi.reconcileStatement(id))}>Reconcile</button>}
          {!draft && canDelete && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => accountingApi.reopenStatement(id))}>Reopen</button>}
          {draft && canDelete && <button type="button" className="btn-secondary" style={{ color: 'var(--red-400)' }} disabled={busy} onClick={() => { if (window.confirm('Delete this statement and its lines?')) void run(() => accountingApi.deleteStatement(id), onBack); }}>Delete</button>}
        </div>} />
      <div className="metric-grid" style={{ marginBottom: 16 }}>
        <Card label="Opening → closing" value={`${tzs(st.openingBalance)} → ${tzs(st.closingBalance)}`} hint={st.arithmeticDifference === 0 ? 'Lines add up' : `Lines are off by ${tzs(st.arithmeticDifference)}`} tone={st.arithmeticDifference === 0 ? undefined : 'bad'} />
        <Card label="Unmatched lines" value={String(st.unmatchedLines)} tone={st.unmatchedLines ? 'bad' : 'good'} />
      </div>
      <section className="table-panel"><div className="section-toolbar"><strong>Statement lines</strong></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th><th>Cash book</th><th /></tr></thead><tbody>
          {st.lines.map((l: any) => {
            const options = (st.unmatchedLedger ?? []).filter((e: any) => Math.round(e.amount * 100) === Math.round(l.amount * 100));
            return <tr key={l.id}>
              <td>{shortDate(l.date)}</td><td>{l.description}{l.reference ? <div className="muted" style={{ fontSize: 12 }}>{l.reference}</div> : null}</td>
              <td className="num" style={{ color: l.amount < 0 ? 'var(--red-400)' : undefined }}>{tzs(l.amount)}</td>
              <td>{l.matched ? <><Badge tone="good">{l.matched.entryNumber}</Badge> <span className="muted" style={{ fontSize: 12 }}>{l.matched.description}</span></> : <Badge tone="warn">Not in books</Badge>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {draft && canEdit && l.matched && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => accountingApi.unmatchLine(l.id))}>Unmatch</button>}
                {draft && canEdit && !l.matched && <>
                  {options.length > 0 && <select className="input-field" style={{ width: 200, display: 'inline-block' }} value="" disabled={busy} onChange={(e) => e.target.value && void run(() => accountingApi.matchLine(l.id, e.target.value))}>
                    <option value="">Match to…</option>{options.map((o: any) => <option key={o.id} value={o.id}>{o.entryNumber} · {shortDate(o.date)} · {o.description ?? ''}</option>)}</select>}{' '}
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setAcct(''); setAdjust(l); }}>Record in books</button>
                </>}
              </td></tr>;
          })}
        </tbody></table></div>
      </section>
    </>}
    {adjust && <Modal title="Record in the books" onClose={() => !busy && setAdjust(null)} width="520px" footer={<Actions label="Post and match" form="adj-form" busy={busy} onCancel={() => setAdjust(null)} />}>
      <form id="adj-form" onSubmit={(e) => { e.preventDefault(); void run(() => accountingApi.adjustLine(adjust.id, { accountId: acct }), () => setAdjust(null)); }} style={{ display: 'grid', gap: 10 }}>
        <p style={{ margin: 0 }}>{shortDate(adjust.date)} · {adjust.description} · <strong>{tzs(adjust.amount)}</strong></p>
        
        <label className="form-label">{adjust.amount > 0 ? 'Credit account' : 'Debit account'}
          <select className="input-field" required value={acct} onChange={(e) => setAcct(e.target.value)}><option value="">Choose account</option>
            {(accounts.data ?? []).filter((a: any) => a.code !== '1000').map((a: any) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}
  </div>;
}

// ───────────────────────── VAT and withholding tax ─────────────────────────
export function VatReturnView({ canCreate }: { canCreate: boolean }) {
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today());
  const r = useLoad<any>(() => accountingApi.vatReturn(from, to), [from, to]);
  const [dlg, setDlg] = useState<'vat' | 'wht' | null>(null);
  const [f, setF] = useState({ through: today(), paidOn: today(), reference: '', amount: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (dlg === 'vat') await accountingApi.settleVat({ through: f.through, paidOn: f.paidOn, reference: f.reference || undefined });
      else await accountingApi.remitWithholding({ amount: Number(f.amount), paidOn: f.paidOn, reference: f.reference || undefined });
      setDlg(null); r.reload();
    } catch (e) { setErr(errText(e, 'Could not record the payment.')); } finally { setBusy(false); }
  };
  const d = r.data;
  return <div>
    <Head action={canCreate && <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" className="btn-secondary" onClick={() => { setErr(''); setDlg('vat'); }}>Record VAT payment</button>
      <button type="button" className="btn-secondary" onClick={() => { setErr(''); setDlg('wht'); }}>Record withholding payment</button></div>} />
    <ErrorBanner message={r.error} onDismiss={() => r.setError('')} />
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <label className="form-label">From<input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="form-label">To<input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
    {d && <>
      <div className="metric-grid" style={{ marginBottom: 16 }}>
        <Card label="Output VAT (sales)" value={tzs(d.outputVat)} />
        <Card label="Input VAT (purchases)" value={tzs(d.inputVat)} />
        <Card label="VAT still owed" value={tzs(d.vatOwedToDate)} hint={`This period: ${tzs(d.netVatPayable)}`} />
        <Card label="Withholding to pay" value={tzs(d.withholdingPayableToDate)} hint={d.withholdingCreditToDate ? `Credit from customers: ${tzs(d.withholdingCreditToDate)}` : undefined} />
      </div>
      {[['Sales', d.sales, 'Customer'], ['Purchases', d.purchases, 'Supplier']].map(([title, rows, who]: any) => <section key={title} className="table-panel" style={{ marginBottom: 16 }}>
        <div className="section-toolbar"><strong>{title}</strong><span className="muted">{rows.length}</span></div>
        {!rows.length ? <div className="muted" style={{ padding: 18 }}>None in this period.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Number</th>{who === 'Supplier' && <th>Supplier</th>}<th>Date</th><th className="num">Net</th><th className="num">VAT</th><th className="num">Total</th><th className="num">Withheld</th></tr></thead><tbody>
          {rows.map((x: any) => <tr key={x.number}><td>{x.number}</td>{who === 'Supplier' && <td>{x.supplier}</td>}<td>{shortDate(x.date)}</td><td className="num">{tzs(x.net)}</td><td className="num">{tzs(x.vat)}</td><td className="num">{tzs(x.total)}</td><td className="num">{x.withheld ? tzs(x.withheld) : '—'}</td></tr>)}
        </tbody></table></div>}
      </section>)}
    </>}
    {dlg && <Modal title={dlg === 'vat' ? 'Record VAT payment' : 'Record withholding tax payment'} onClose={() => !busy && setDlg(null)} width="480px" footer={<Actions label="Post payment" form="tax-pay-form" busy={busy} onCancel={() => setDlg(null)} />}>
      <form id="tax-pay-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
        {dlg === 'vat'
          ? <><p className="muted" style={{ margin: 0, fontSize: 13 }}>Clears output and input VAT up to this date.</p>
              <label className="form-label">Settle VAT up to<input className="input-field" type="date" required value={f.through} onChange={(e) => setF({ ...f, through: e.target.value })} /></label></>
          : <label className="form-label">Amount paid (TZS)<MoneyInput className="input-field" min="0.01" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>}
        <label className="form-label">Paid on<input className="input-field" type="date" required value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
        <label className="form-label">Reference (optional)<input className="input-field" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Payment slip or receipt number" /></label>
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}
  </div>;
}

// ───────────────────────── Customer invoices and supplier bills ─────────────────────────
export function DocumentsView({ kind, canCreate, canEdit, view = 'all' }: { kind: 'invoice' | 'bill'; canCreate: boolean; canEdit: boolean; view?: 'all' | 'unpaid' | 'paid' }) {
  const isBill = kind === 'bill';
  // unpaid = what is still owed (with the balance), paid = what has been settled and how, void = cancelled
  const [tab, setTab] = useState<'unpaid' | 'PAID' | 'VOID'>(view === 'paid' ? 'PAID' : 'unpaid');
  const list = useLoad<any[]>(() => (tab === 'unpaid' ? (isBill ? accountingApi.payables() : accountingApi.receivables()) : isBill ? accountingApi.bills({ status: tab }) : accountingApi.invoices({ status: tab })), [kind, tab]);
  const [payAmount, setPayAmount] = useState('');
  const tax = useLoad<any>(() => accountingApi.taxSettings(), []);
  const accounts = useLoad<any[]>(() => accountingApi.accounts(), []);
  const suppliers = useLoad<any[]>(() => (isBill ? suppliersApi.getAll() : Promise.resolve({ data: [] })), [kind]);
  const supplierChoices = (suppliers.data ?? []).filter((x: any) => x.isActive);
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [voiding, setVoiding] = useState<any>(null);
  const [payAccount, setPayAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const blank = { number: '', party: '', supplierId: '', amount: '', dueDate: today(), description: '', accountCode: '', vatApplies: true, withholdingPercent: '' };
  const [f, setF] = useState(blank);
  const vat = tax.data?.vatRegistered ? tax.data.vatRate : 0;
  const net = Number(f.amount) || 0;
  const vatAmt = vat && f.vatApplies ? Math.round(net * vat) / 100 : 0;
  const wht = Math.round(net * (Number(f.withholdingPercent) || 0)) / 100;
  const choices = (accounts.data ?? []).filter((a: any) => (isBill ? ['EXPENSE', 'ASSET'] : ['INCOME']).includes(a.type));
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); list.reload(); } catch (e) { setErr(errText(e, 'That did not work.')); } };
  const chosenSupplier = supplierChoices.find((x: any) => x.id === f.supplierId);
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const common = { amount: net, dueDate: f.dueDate, description: f.description || undefined, vatApplies: vat ? f.vatApplies : undefined, withholdingPercent: f.withholdingPercent ? Number(f.withholdingPercent) : undefined };
      if (isBill) await accountingApi.createBill({ ...common, billNumber: f.number || undefined, supplier: chosenSupplier?.name ?? f.party.trim(), supplierId: chosenSupplier?.id, expenseAccountCode: f.accountCode || undefined });
      else await accountingApi.createInvoice({ ...common, invoiceNumber: f.number || undefined, revenueAccountCode: f.accountCode || undefined });
      setOpen(false); setF(blank); list.reload();
    } catch (e) { setErr(errText(e, 'Could not save.')); } finally { setBusy(false); }
  };
  const rows = list.data ?? [];
  const showVat = rows.some((x: any) => x.vatAmount);
  const showWht = rows.some((x: any) => x.withholdingAmount);
  return <div>
    <Head action={canCreate && <button type="button" className="btn-primary" onClick={() => { setErr(''); setOpen(true); }}>{isBill ? 'Record bill' : 'Record invoice'}</button>} />
    <ErrorBanner message={list.error || err} onDismiss={() => { list.setError(''); setErr(''); }} />
    <section className="table-panel"><div className="section-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
      {view === 'all' ? <>{([['unpaid', 'Unpaid'], ['PAID', isBill ? 'Paid' : 'Received'], ['VOID', 'Cancelled']] as const).map(([k, label]) => <button key={k} type="button" className={tab === k ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(k)}>{label}</button>)}</> : <strong>{view === 'paid' ? (isBill ? 'Payments made' : 'Payments received') : 'Unpaid'}</strong>}
      <span className="muted" style={{ marginLeft: 'auto' }}>{rows.length}</span></div>
      {list.loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !rows.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>{tab === 'unpaid' ? (isBill ? 'No unpaid bills.' : 'No unpaid invoices.') : tab === 'PAID' ? (isBill ? 'No bills have been paid yet.' : 'No payments received yet.') : 'Nothing has been cancelled.'}</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Number</th><th>{isBill ? 'Supplier' : 'Customer'}</th><th>Due</th>{showVat && <th className="num">VAT</th>}{showWht && <th className="num">Withheld</th>}<th className="num">Total</th><th className="num">{tab === 'unpaid' ? 'Balance' : 'Settled'}</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((x: any) => <tr key={x.id}><td>{isBill ? x.billNumber : x.invoiceNumber}</td><td>{isBill ? x.supplier : x.buyer?.companyName ?? x.buyer?.name ?? '—'}</td><td>{shortDate(x.dueDate)}</td>
            {showVat && <td className="num">{x.vatAmount ? tzs(x.vatAmount) : '—'}</td>}{showWht && <td className="num">{x.withholdingAmount ? tzs(x.withholdingAmount) : '—'}</td>}<td className="num">{tzs(x.total ?? x.amount)}</td>
            <td className="num">{tab === 'unpaid' ? <strong>{tzs(x.balance ?? x.amount)}</strong> : tzs(x.amountPaid ?? 0)}
              {tab !== 'unpaid' && x.payments?.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{x.payments.map((p: any) => `${shortDate(p.paidAt)}: ${tzs(p.cash)}`).join(' · ')}</div>}</td>
            <td>{x.status === 'PAID' ? <Badge tone="good">{isBill ? 'Paid' : 'Received'}</Badge> : x.status === 'VOID' ? <Badge tone="muted">Cancelled</Badge> : x.status === 'OVERDUE' ? <Badge tone="bad">Overdue</Badge> : x.amountPaid > 0 ? <Badge tone="warn">Part paid</Badge> : <Badge tone="muted">Open</Badge>}</td>
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{x.source === 'ORDERS' ? <a className="btn-secondary" href="/dashboard/ops-orders">Take payment in Orders &amp; Sales</a> : canEdit && tab === 'unpaid' && <>
              <button type="button" className="btn-secondary" onClick={() => { setPayAmount(''); setPaying(x); }}>{isBill ? 'Mark paid' : 'Mark received'}</button>{' '}
              {!(x.amountPaid > 0) && <button type="button" className="btn-secondary" style={{ color: 'var(--red-400)' }} onClick={() => setVoiding(x)}>Void</button>}</>}</td></tr>)}
        </tbody></table></div>}
    </section>
    {voiding && <Modal title={`Void ${isBill ? voiding.billNumber : voiding.invoiceNumber}?`} subtitle={`${tzs(voiding.amount)}${isBill ? ` · ${voiding.supplier}` : ''}`} onClose={() => setVoiding(null)} width="460px"
      footer={<><button type="button" className="btn-secondary" onClick={() => setVoiding(null)}>Keep it</button><button type="button" className="btn-primary" style={{ background: 'var(--red-500, #dc2626)' }} onClick={() => { const target = voiding; setVoiding(null); void run(() => (isBill ? accountingApi.voidBill(target.id) : accountingApi.voidInvoice(target.id))); }}>Void {isBill ? 'bill' : 'invoice'}</button></>}>
      <p style={{ margin: 0, fontSize: 14 }}>The {isBill ? 'bill' : 'invoice'} is cancelled and no longer counts as {isBill ? 'owed to the supplier' : 'owed to you'}. Its entries in the books are offset by opposite entries, not deleted, so the history stays.</p>
    </Modal>}
    {paying && <Modal title={isBill ? `Pay ${paying.billNumber}` : `Receive payment for ${paying.invoiceNumber}`} subtitle={`${tzs(paying.balance ?? paying.amount)} still ${isBill ? 'owed' : 'to receive'}${isBill ? ` to ${paying.supplier}` : ''}`} onClose={() => setPaying(null)} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={() => setPaying(null)}>Cancel</button><button type="button" className="btn-primary" onClick={() => { const target = paying; setPaying(null); void run(() => (isBill ? accountingApi.payBill(target.id, payAccount || undefined, payAmount ? Number(payAmount) : undefined) : accountingApi.payInvoice(target.id, payAccount || undefined, payAmount ? Number(payAmount) : undefined))); }}>{payAmount && Number(payAmount) < (paying.balance ?? paying.amount) ? (isBill ? 'Record part payment' : 'Record part receipt') : isBill ? 'Mark as paid' : 'Mark as received'}</button></>}>
      <label className="form-label">Amount {isBill ? 'paying' : 'settled'} now (TZS)<MoneyInput className="input-field" min="0.01" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={`Leave empty for all (${tzs(paying.balance ?? paying.amount)})`} /></label>
      <MoneyAccountSelect label={isBill ? 'Paid from' : 'Received into'} value={payAccount} onChange={setPayAccount} defaultKind="BANK" />
    </Modal>}
    {open && <Modal title={isBill ? 'Record supplier bill' : 'Record customer invoice'} onClose={() => !busy && setOpen(false)} width="600px" footer={<Actions label="Save" form="doc-form" busy={busy} onCancel={() => setOpen(false)} />}>
      <form id="doc-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {isBill
            ? <div style={{ display: 'grid', gap: 6 }}>
              <label className="form-label">Supplier
                <select className="input-field" required value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value, party: e.target.value === 'other' ? f.party : '' })}>
                  <option value="" disabled>Choose a supplier…</option>
                  {supplierChoices.map((x: any) => <option key={x.id} value={x.id}>{x.name} · {x.kind === 'INDIVIDUAL' ? 'Individual' : 'Company'}</option>)}
                  <option value="other">Someone else (type a name)</option>
                </select>
              </label>
              {f.supplierId === 'other' && <input className="input-field" required autoFocus placeholder="Supplier name" aria-label="Supplier name" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} />}
              {!supplierChoices.length && !suppliers.loading && <span className="muted" style={{ fontSize: 11 }}>No suppliers yet. <Link href="/dashboard/suppliers">Add your suppliers</Link> to pick them here.</span>}
            </div>
            : <label className="form-label">Number<input className="input-field" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="Auto-number" /></label>}
          <label className="form-label">{isBill ? 'Bill number' : 'Due date'}{isBill
            ? <input className="input-field" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="Auto-number" />
            : <input className="input-field" type="date" required value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />}</label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="form-label">Amount before VAT (TZS)<MoneyInput className="input-field" min="0.01" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          {isBill ? <label className="form-label">Due date<input className="input-field" type="date" required value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label> : <label className="form-label">Customer withholds (%)<input className="input-field" type="number" min="0" max="100" step="0.01" value={f.withholdingPercent} onChange={(e) => setF({ ...f, withholdingPercent: e.target.value })} placeholder="0" /></label>}
        </div>
        {isBill && <label className="form-label">We withhold (%)<input className="input-field" type="number" min="0" max="100" step="0.01" value={f.withholdingPercent} onChange={(e) => setF({ ...f, withholdingPercent: e.target.value })} placeholder="0" /></label>}
        <label className="form-label">{isBill ? 'Cost account' : 'Income account'}<select className="input-field" value={f.accountCode} onChange={(e) => setF({ ...f, accountCode: e.target.value })}><option value="">{isBill ? '5000 · Production input costs (default)' : '4000 · Rice sales revenue (default)'}</option>{choices.map((a: any) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}</select></label>
        <label className="form-label">Description<input className="input-field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        {vat > 0 && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.vatApplies} onChange={(e) => setF({ ...f, vatApplies: e.target.checked })} /> VAT applies ({vat}%) — untick for zero-rated or exempt</label>}
        {net > 0 && <div className="muted" style={{ fontSize: 13 }}>Net {tzs(net)}{vatAmt ? ` + VAT ${tzs(vatAmt)}` : ''} = <strong>{tzs(net + vatAmt)}</strong>{wht ? ` · ${isBill ? 'we pay the supplier' : 'customer pays us'} ${tzs(net + vatAmt - wht)} and ${isBill ? 'owe the revenue authority' : 'get a tax credit of'} ${tzs(wht)}` : ''}</div>}
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}
  </div>;
}

// ───────────────────────── Everyday expenses and income ─────────────────────────
