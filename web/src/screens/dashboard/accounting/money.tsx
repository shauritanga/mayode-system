'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the rest of the accounting screens */

import { useState } from 'react';
import { accountingApi } from '@/lib/api';
import Modal from '@/components/Modal';
import ErrorBanner from '@/components/ErrorBanner';
import { Actions, Badge, Card, Head, errText, shortDate, today, tzs, useLoad, KIND_WORDS } from './controls';
import MoneyInput from '@/components/MoneyInput';

// ───────────────────────── Money accounts ─────────────────────────
export function MoneyAccountsView({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const accounts = useLoad<any>(() => accountingApi.cashAccounts({ includeInactive: 'true' }), []);
  const transfers = useLoad<any[]>(() => accountingApi.cashTransfers(), []);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ from?: string; to?: string } | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [cancelling, setCancelling] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const reload = () => { accounts.reload(); transfers.reload(); };
  const data = accounts.data;
  const items: any[] = data?.items ?? [];
  const active = items.filter((a) => a.isActive);
  const groups = ['CASH', 'BANK', 'MOBILE_MONEY'].map((k) => ({ kind: k, rows: items.filter((a) => a.kind === k) })).filter((g) => g.rows.length);
  const done = (m: string) => { setMessage(m); reload(); };
  const patch = async (id: string, body: object, text: string) => { setErr(''); try { await accountingApi.updateCashAccount(id, body); done(text); } catch (e) { setErr(errText(e, 'Could not save.')); } };

  return <div>
    <Head text="Where the cooperative keeps its money. Every payment you record goes into one of these." action={<span style={{ display: 'flex', gap: 8 }}>
      {canCreate && active.length > 0 && <button type="button" className="btn-secondary" onClick={() => setMoving({})}>Move money</button>}
      {canCreate && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add an account</button>}
    </span>} />
    {message && <div className="alert-box" style={{ marginBottom: 12 }} role="status">{message} <button type="button" className="btn-secondary" style={{ marginLeft: 8, padding: '0 8px' }} onClick={() => setMessage('')}>OK</button></div>}
    <ErrorBanner message={accounts.error || transfers.error || err} onDismiss={() => { accounts.setError(''); transfers.setError(''); setErr(''); }} />

    {data && <div className="metric-grid" style={{ marginBottom: 16 }}>
      <Card label="Total money" value={tzs(data.total)} hint="All accounts together; matches the cash in your books" />
      {data.unassigned !== 0 && <Card label="Not assigned to an account" value={tzs(data.unassigned)} tone={data.unassigned < 0 ? 'bad' : undefined} hint="Money recorded before accounts were set up. Move it into an account." />}
    </div>}

    {data && data.unassigned !== 0 && canCreate && active.length > 0 && <div className="glass-card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span><strong>{tzs(data.unassigned)}</strong> is not in any account yet. Put it where it really is, so each account shows the right balance.</span>
      <button type="button" className="btn-primary" onClick={() => setMoving({ to: active[0].id })}>Assign it to an account</button>
    </div>}

    {accounts.loading && !data ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : groups.length === 0 ? (
      <div className="glass-card" style={{ padding: 28, textAlign: 'center' }}>
        <strong>No money accounts yet</strong>
        <p className="muted" style={{ margin: '8px 0 14px' }}>Add the cash box, each bank account and each mobile money wallet the cooperative uses. You can enter what is in each one today.</p>
        {canCreate && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add the first account</button>}
      </div>
    ) : groups.map((g) => (
      <section key={g.kind} className="table-panel" style={{ marginBottom: 16 }}>
        <div className="section-toolbar"><strong>{g.kind === 'CASH' ? 'Cash' : g.kind === 'BANK' ? 'Bank accounts' : 'Mobile money'}</strong><span className="muted">{g.rows.filter((a) => a.isActive).length}</span></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Name</th><th>Details</th><th className="num">Balance</th><th /></tr></thead><tbody>
          {g.rows.map((a) => <tr key={a.id} style={{ opacity: a.isActive ? 1 : 0.55 }}>
            <td><strong>{a.name}</strong>{a.isDefault && a.isActive && <> <Badge tone="good">Used by default</Badge></>}{!a.isActive && <> <Badge tone="muted">Switched off</Badge></>}</td>
            <td className="muted">{[a.provider, a.accountNumber].filter(Boolean).join(' · ') || '—'}</td>
            <td className="num"><strong style={{ color: a.balance < 0 ? 'var(--red-400)' : undefined }}>{tzs(a.balance)}</strong></td>
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{canEdit && <>
              {a.isActive && canCreate && <button type="button" className="btn-secondary" onClick={() => setMoving({ from: a.id })}>Move money</button>}{' '}
              <button type="button" className="btn-secondary" onClick={() => setEditing(a)}>Edit</button>{' '}
              {a.isActive && !a.isDefault && <button type="button" className="btn-secondary" onClick={() => void patch(a.id, { isDefault: true }, `${a.name} will be used by default for ${KIND_WORDS[a.kind].toLowerCase()} payments.`)}>Make default</button>}{' '}
              {!a.isActive && <button type="button" className="btn-secondary" onClick={() => void patch(a.id, { isActive: true }, `${a.name} switched on.`)}>Switch on</button>}
            </>}</td>
          </tr>)}
        </tbody></table></div>
      </section>
    ))}

    <section className="table-panel">
      <div className="section-toolbar"><strong>Money moved between accounts</strong></div>
      {!(transfers.data ?? []).length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No transfers yet. Use “Move money” when you bank cash, withdraw, or top up a wallet.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>No.</th><th>Date</th><th>From</th><th>To</th><th className="num">Amount</th><th>Note</th><th /></tr></thead><tbody>
          {(transfers.data ?? []).map((t) => <tr key={t.id} style={{ opacity: t.status === 'CANCELLED' ? 0.5 : 1 }}>
            <td>{t.number}</td><td>{shortDate(t.date)}</td><td>{t.from?.name ?? 'Not assigned'}</td><td>{t.to?.name ?? 'Not assigned'}</td>
            <td className="num">{tzs(t.amount)}</td><td className="muted">{t.status === 'CANCELLED' ? `Cancelled: ${t.cancelReason}` : t.note ?? '—'}</td>
            <td style={{ textAlign: 'right' }}>{canEdit && t.status === 'POSTED' && <button type="button" className="btn-secondary" onClick={() => setCancelling(t)}>Cancel</button>}</td>
          </tr>)}
        </tbody></table></div>}
    </section>

    {adding && <AccountModal onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); done(m); }} />}
    {editing && <AccountModal account={editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); done(m); }} />}
    {moving && <TransferModal accounts={active} unassigned={data?.unassigned ?? 0} start={moving} onClose={() => setMoving(null)} onSaved={(m) => { setMoving(null); done(m); }} />}
    {cancelling && <CancelTransferModal transfer={cancelling} onClose={() => setCancelling(null)} onSaved={(m) => { setCancelling(null); done(m); }} />}
  </div>;
}

function AccountModal({ account, onClose, onSaved }: { account?: any; onClose: () => void; onSaved: (message: string) => void }) {
  const editing = !!account;
  const [f, setF] = useState({ name: account?.name ?? '', kind: account?.kind ?? 'BANK', provider: account?.provider ?? '', accountNumber: account?.accountNumber ?? '', openingBalance: '', openingDate: today(), notes: account?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (editing) await accountingApi.updateCashAccount(account.id, { name: f.name, provider: f.provider, accountNumber: f.accountNumber, notes: f.notes });
      else await accountingApi.createCashAccount({ name: f.name, kind: f.kind, provider: f.provider || undefined, accountNumber: f.accountNumber || undefined, notes: f.notes || undefined, ...(Number(f.openingBalance) > 0 ? { openingBalance: Number(f.openingBalance), openingDate: f.openingDate } : {}) });
      onSaved(editing ? 'Account saved.' : `${f.name.trim()} added.`);
    } catch (e) { setErr(errText(e, 'Could not save the account.')); } finally { setBusy(false); }
  };
  const placeholder = f.kind === 'BANK' ? 'e.g. CRDB main account' : f.kind === 'MOBILE_MONEY' ? 'e.g. M-Pesa wallet' : 'e.g. Office cash box';
  return <Modal title={editing ? 'Edit account' : 'Add a money account'} subtitle={editing ? undefined : 'Cash box, bank account or mobile money wallet.'} onClose={() => !busy && onClose()} width="540px" footer={<Actions label="Save" form="acct-form" busy={busy} onCancel={onClose} />}>
    <form id="acct-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
      {!editing && <label className="form-label">What kind is it?<select className="input-field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="BANK">Bank account</option><option value="MOBILE_MONEY">Mobile money wallet</option><option value="CASH">Cash box</option></select></label>}
      <label className="form-label">Name<input className="input-field" required autoFocus value={f.name} placeholder={placeholder} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      {f.kind !== 'CASH' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="form-label">{f.kind === 'BANK' ? 'Bank' : 'Network'} (optional)<input className="input-field" value={f.provider} placeholder={f.kind === 'BANK' ? 'CRDB, NMB…' : 'M-Pesa, Tigo Pesa…'} onChange={(e) => setF({ ...f, provider: e.target.value })} /></label>
        <label className="form-label">{f.kind === 'BANK' ? 'Account number' : 'Phone number'} (optional)<input className="input-field" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} /></label>
      </div>}
      {!editing && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="form-label">Money in it today (TZS)<MoneyInput className="input-field" min="0" step="0.01" value={f.openingBalance} placeholder="0" onChange={(e) => setF({ ...f, openingBalance: e.target.value })} /></label>
        <label className="form-label">As at<input className="input-field" type="date" max={today()} value={f.openingDate} onChange={(e) => setF({ ...f, openingDate: e.target.value })} /></label>
      </div>}
      {!editing && <span className="muted" style={{ fontSize: 12 }}>The money already in the account is added to your books as the cooperative’s own funds. Leave it empty if the account is new.</span>}
      {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }} role="alert">{err}</div>}
    </form>
  </Modal>;
}

function TransferModal({ accounts, unassigned, start, onClose, onSaved }: { accounts: any[]; unassigned: number; start: { from?: string; to?: string }; onClose: () => void; onSaved: (message: string) => void }) {
  const [f, setF] = useState({ from: start.from ?? (start.to ? 'none' : accounts[0]?.id ?? ''), to: start.to ?? (start.from ? accounts.find((a) => a.id !== start.from)?.id ?? '' : accounts[1]?.id ?? ''), amount: start.to && !start.from && unassigned > 0 ? String(unassigned) : '', date: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const place = (v: string) => (v === 'none' ? undefined : v);
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await accountingApi.createCashTransfer({ fromAccountId: place(f.from), toAccountId: place(f.to), amount: Number(f.amount), date: f.date, note: f.note || undefined });
      onSaved(`${tzs(Number(f.amount))} moved.`);
    } catch (e) { setErr(errText(e, 'Could not move the money.')); } finally { setBusy(false); }
  };
  const options = (skipId: string, skipNone = false) => [
    ...(skipNone ? [] : [<option key="none" value="none">Not assigned to an account{unassigned ? ` (${tzs(unassigned)})` : ''}</option>]),
    ...accounts.filter((a) => a.id !== skipId).map((a) => <option key={a.id} value={a.id}>{a.name} ({tzs(a.balance)})</option>),
  ];
  return <Modal title="Move money" subtitle="For example banking cash, withdrawing, or topping up a wallet." onClose={() => !busy && onClose()} width="520px" footer={<Actions label="Move money" form="move-form" busy={busy} onCancel={onClose} />}>
    <form id="move-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
      <label className="form-label">Take it from<select className="input-field" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value === f.to ? '' : f.to })}>{options('')}</select></label>
      <label className="form-label">Put it into<select className="input-field" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="" disabled>Choose…</option>{options(f.from, f.from === 'none')}</select></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="form-label">Amount (TZS)<MoneyInput className="input-field" min="0.01" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label className="form-label">Date<input className="input-field" type="date" max={today()} required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      </div>
      <label className="form-label">Note (optional)<input className="input-field" value={f.note} placeholder="e.g. Banked the week’s takings" onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }} role="alert">{err}</div>}
    </form>
  </Modal>;
}

function CancelTransferModal({ transfer, onClose, onSaved }: { transfer: any; onClose: () => void; onSaved: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await accountingApi.cancelCashTransfer(transfer.id, reason); onSaved(`${transfer.number} cancelled. The money is back where it was.`); } catch (e) { setErr(errText(e, 'Could not cancel.')); } finally { setBusy(false); }
  };
  return <Modal title={`Cancel ${transfer.number}`} subtitle={`${tzs(transfer.amount)} from ${transfer.from?.name ?? 'Not assigned'} to ${transfer.to?.name ?? 'Not assigned'}`} onClose={() => !busy && onClose()} width="480px" footer={<Actions label="Cancel the transfer" form="cancel-move" busy={busy} onCancel={onClose} />}>
    <form id="cancel-move" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
      <label className="form-label">Why?<input className="input-field" required minLength={5} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }} role="alert">{err}</div>}
    </form>
  </Modal>;
}

// ───────────────────────── Cash book ─────────────────────────
/** Money in and out of one account (or of all of one kind), with a running balance. */
export function CashBookView({ kind }: { kind?: 'MOBILE_MONEY' }) {
  const accounts = useLoad<any>(() => accountingApi.cashAccounts(), []);
  const [account, setAccount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const book = useLoad<any>(() => accountingApi.cashBook({ account: account || undefined, kind: account ? undefined : kind, from: from || undefined, to: to || undefined }), [account, kind, from, to]);
  const choices: any[] = (accounts.data?.items ?? []).filter((a: any) => !kind || a.kind === kind);
  const b = book.data;
  return <div>
    <Head text={kind ? 'Every payment through your mobile money wallets.' : 'Every payment in and out, account by account, with the balance after each.'} />
    <ErrorBanner message={book.error || accounts.error} onDismiss={() => { book.setError(''); accounts.setError(''); }} />
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
      <label className="form-label">Account
        <select className="input-field" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">{kind ? 'All mobile money wallets' : 'All accounts together'}</option>
          {choices.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          {!kind && (accounts.data?.unassigned ?? 0) !== 0 && <option value="unassigned">Not assigned to an account</option>}
        </select>
      </label>
      <label className="form-label">From<input className="input-field" type="date" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="form-label">To<input className="input-field" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
      {(from || to) && <button type="button" className="btn-secondary" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
    </div>
    {b && <div className="metric-grid" style={{ marginBottom: 16 }}>
      <Card label={from ? `Balance before ${shortDate(from)}` : 'Started with'} value={tzs(b.opening)} />
      <Card label="Money in" value={tzs(b.totalIn)} tone="good" />
      <Card label="Money out" value={tzs(b.totalOut)} />
      <Card label="Balance now" value={tzs(b.closing)} tone={b.closing < 0 ? 'bad' : undefined} hint={b.account} />
    </div>}
    <section className="table-panel">
      {book.loading && !b ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !b?.rows?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No money has moved here{from || to ? ' in these dates' : ' yet'}.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Entry</th><th>What for</th>{!account && <th>Account</th>}<th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead><tbody>
          {b.rows.map((r: any) => <tr key={r.id}>
            <td>{shortDate(r.date)}</td><td>{r.number}</td><td>{r.description ?? '—'}</td>{!account && <td className="muted">{r.account}</td>}
            <td className="num">{r.moneyIn ? tzs(r.moneyIn) : ''}</td><td className="num">{r.moneyOut ? tzs(r.moneyOut) : ''}</td>
            <td className="num"><strong style={{ color: r.balance < 0 ? 'var(--red-400)' : undefined }}>{tzs(r.balance)}</strong></td>
          </tr>)}
        </tbody></table></div>}
    </section>
  </div>;
}
