'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the rest of the accounting screens */

import { useEffect, useState } from 'react';
import { accountingApi, mamcosApi, setAccountingMamcos, uploadsApi } from '@/lib/api';
import Modal from '@/components/Modal';
import ErrorBanner from '@/components/ErrorBanner';
import MoneyInput from '@/components/MoneyInput';
import { useAuthStore } from '@/store/auth.store';
import { Actions, Badge, Head, MoneyAccountSelect, errText, shortDate, today, tzs, useLoad } from './controls';

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' }> = {
  POSTED: { label: 'Booked', tone: 'good' },
  PENDING_APPROVAL: { label: 'Waiting for approval', tone: 'warn' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  VOID: { label: 'Cancelled', tone: 'muted' },
};
const fileName = (url: string) => decodeURIComponent(url.split('/').pop() ?? url);

/** Receipt files: uploads each chosen file and lists what is attached. */
function Attachments({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr('');
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 5 - value.length)) urls.push((await uploadsApi.upload(f)).data.url);
      onChange([...value, ...urls].slice(0, 5));
    } catch (e) { setErr(errText(e, 'Could not upload the file.')); } finally { setBusy(false); }
  };
  return <div className="form-label">Receipts and files (up to 5)
    <input className="input-field" type="file" multiple accept="image/*,.pdf" disabled={busy || value.length >= 5} onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
    {busy && <span className="muted" style={{ fontSize: 12 }}>Uploading…</span>}
    {err && <span style={{ color: 'var(--red-400)', fontSize: 12 }}>{err}</span>}
    {value.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{value.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{fileName(u)}</a> <button type="button" className="btn-secondary" style={{ padding: '0 8px' }} onClick={() => onChange(value.filter((x) => x !== u))}>Remove</button></li>)}</ul>}
  </div>;
}

export function CashTransactionsView({ kind, canCreate, canEdit, canApprove }: { kind: 'EXPENSE' | 'INCOME'; canCreate: boolean; canEdit: boolean; canApprove: boolean }) {
  const isExp = kind === 'EXPENSE';
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === 'SUPER_ADMIN';
  // Super Admin has no cooperative of their own, so they pick whose books to work in.
  const [coop, setCoop] = useState('');
  const coops = useLoad<any>(() => (isSuper ? mamcosApi.getAll() : Promise.resolve({ data: [] })), [isSuper]);
  useEffect(() => { setAccountingMamcos(coop); return () => setAccountingMamcos(''); }, [coop]);
  const blocked = isSuper && !coop;

  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useLoad<any>(() => (blocked ? Promise.resolve({ data: null }) : accountingApi.cashTransactions({ kind, q: q.trim() || undefined, from: from || undefined, to: to || undefined })), [kind, q, from, to, coop]);
  const cats = useLoad<any[]>(() => accountingApi.cashCategories(kind), [kind]);
  const tax = useLoad<any>(() => (blocked ? Promise.resolve({ data: null }) : accountingApi.taxSettings()), [coop]);
  const limit = useLoad<any>(() => (blocked || !isExp ? Promise.resolve({ data: null }) : accountingApi.cashSettings()), [coop, isExp]);
  const [limitEdit, setLimitEdit] = useState<string | null>(null); // null = show what is saved
  const limitText = limitEdit ?? (limit.data?.approvalThreshold ? String(limit.data.approvalThreshold) : '');
  const setLimitText = (v: string) => setLimitEdit(v);

  const blank = { date: today(), amount: '', accountCode: '', party: '', method: 'CASH', cashAccountId: '', reference: '', note: '', includesVat: false, attachments: [] as string[], reason: '' };
  const [form, setForm] = useState<{ mode: 'create' | 'correct'; target?: any } | null>(null);
  const [f, setF] = useState(blank);
  const [details, setDetails] = useState<any>(null);
  const [d, setD] = useState({ party: '', reference: '', note: '', attachments: [] as string[] });
  const [voiding, setVoiding] = useState<any>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const vatOn = !!tax.data?.vatRegistered;
  const vatPart = vatOn && f.includesVat && Number(f.amount) > 0 ? Math.round((Number(f.amount) * tax.data.vatRate * 100) / (100 + tax.data.vatRate)) / 100 : 0;
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setErr(''); setNotice('');
    try { await fn(); if (ok) setNotice(ok); list.reload(); return true; } catch (e) { setErr(errText(e, 'That did not work.')); return false; } finally { setBusy(false); }
  };

  const openCreate = () => { setErr(''); setF(blank); setForm({ mode: 'create' }); };
  const openCorrect = (x: any) => {
    setErr(''); setF({ ...blank, date: x.date, amount: String(x.amount), accountCode: x.accountCode, party: x.party ?? '', reference: x.reference ?? '', note: x.note ?? '', attachments: x.attachments ?? [] });
    setForm({ mode: 'correct', target: x });
  };
  const save = async () => {
    const body = { kind, date: f.date, amount: Number(f.amount), accountCode: f.accountCode, party: f.party || undefined, method: f.method, cashAccountId: f.cashAccountId || undefined, reference: f.reference || undefined, note: f.note || undefined, includesVat: f.includesVat, attachments: f.attachments };
    const done = form?.mode === 'correct'
      ? await act(() => accountingApi.correctCashTransaction(form.target.id, { ...body, reason: f.reason }), 'The record was corrected. The old one is kept as cancelled.')
      : await act(async () => { const r = (await accountingApi.createCashTransaction(body)).data; if (r.status === 'PENDING_APPROVAL') setNotice(`${r.number} is above the approval limit and is waiting for another person to approve it. Nothing is booked yet.`); });
    if (done) { setForm(null); setF(blank); }
  };

  const data = list.data;
  const items: any[] = data?.items ?? [];
  const correcting = form?.mode === 'correct';
  return <div>
    {isSuper && <section className="glass-card" style={{ padding: 14, marginBottom: 14 }}>
      <label className="form-label" style={{ margin: 0 }}>Cooperative
        <select className="input-field" value={coop} onChange={(e) => setCoop(e.target.value)}>
          <option value="">Choose a cooperative…</option>{(Array.isArray(coops.data) ? coops.data : coops.data?.data ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
    </section>}
    {blocked ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Choose a cooperative to see and record its {isExp ? 'expenses' : 'income'}.</div> : <>
    <Head action={canCreate && <button type="button" className="btn-primary" onClick={openCreate}>{isExp ? 'Record expense' : 'Record income'}</button>} />
    <ErrorBanner message={list.error || err} onDismiss={() => { list.setError(); setErr(''); }} />
    {notice && <div className="glass-card" style={{ padding: 12, marginBottom: 12, color: 'var(--green-400, #4ade80)' }}>{notice}</div>}
    {isExp && canEdit && <section className="glass-card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label className="form-label" style={{ margin: 0, minWidth: 240 }}>Approval limit (TZS)
        <MoneyInput className="input-field" min="0" step="1" value={limitText} onChange={(e) => setLimitText(e.target.value)} placeholder="No limit" />
      </label>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act(async () => { await accountingApi.saveCashSettings({ approvalThreshold: limitText ? Number(limitText) : null }); limit.reload(); setLimitEdit(null); }, limitText ? 'Saved. Expenses of this amount or more now need a second person’s approval.' : 'Saved. Expenses no longer need approval.')}>Save limit</button>
      <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 200 }}>An expense at or above this amount is held until a different person with approval rights approves it. Leave empty for no limit.</span>
    </section>}
    <section className="table-panel">
      <div className="section-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <strong>{isExp ? 'Expenses' : 'Other income'}</strong>
        <input className="input-field" style={{ width: 200 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input-field" style={{ width: 150 }} type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input-field" style={{ width: 150 }} type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="muted" style={{ marginLeft: 'auto' }}>{data ? `${data.count} booked · ${tzs(data.total)}${data.pending ? ` · ${data.pending} waiting` : ''}` : ''}</span>
      </div>
      {list.loading && !data ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !items.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>{isExp ? 'No expenses recorded.' : 'No income recorded.'}</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>No.</th><th>Category</th><th>{isExp ? 'Paid to' : 'Received from'}</th><th>{isExp ? 'Paid from' : 'Received into'}</th><th className="num">Amount</th><th>Status</th><th /></tr></thead><tbody>
          {items.map((x: any) => {
            const st = STATUS[x.status] ?? STATUS.POSTED;
            const dead = x.status === 'VOID' || x.status === 'REJECTED';
            return <tr key={x.id} style={dead ? { opacity: 0.55 } : undefined}>
              <td>{shortDate(x.date)}</td>
              <td>{x.number}{x.replacesId && <div className="muted" style={{ fontSize: 12 }}>Correction</div>}</td>
              <td>{x.category}{x.note && <div className="muted" style={{ fontSize: 12 }}>{x.note}</div>}{x.reference && <div className="muted" style={{ fontSize: 12 }}>Ref {x.reference}</div>}
                {x.attachments?.length > 0 && <div style={{ fontSize: 12 }}>{x.attachments.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{fileName(u)}</a>)}</div>}</td>
              <td>{x.party ?? '—'}</td>
              <td className="muted">{x.account ?? '—'}</td>
              <td className="num" style={dead ? { textDecoration: 'line-through' } : undefined}>{tzs(x.amount)}{x.vatAmount > 0 && <div className="muted" style={{ fontSize: 12 }}>incl. VAT {tzs(x.vatAmount)}</div>}</td>
              <td><Badge tone={st.tone}>{st.label}</Badge>{x.voidReason && <div className="muted" style={{ fontSize: 12 }}>{x.voidReason}</div>}{x.rejectedReason && <div className="muted" style={{ fontSize: 12 }}>{x.rejectedReason}</div>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {canApprove && x.status === 'PENDING_APPROVAL' && <><button type="button" className="btn-primary" disabled={busy} onClick={() => void act(() => accountingApi.approveCashTransaction(x.id), `${x.number} was approved and booked.`)}>Approve</button>{' '}<button type="button" className="btn-secondary" onClick={() => { setErr(''); setReason(''); setRejecting(x); }}>Reject</button>{' '}</>}
                {canEdit && !dead && <><button type="button" className="btn-secondary" onClick={() => { setErr(''); setD({ party: x.party ?? '', reference: x.reference ?? '', note: x.note ?? '', attachments: x.attachments ?? [] }); setDetails(x); }}>Details</button>{' '}<button type="button" className="btn-secondary" onClick={() => openCorrect(x)}>Correct</button>{' '}<button type="button" className="btn-secondary" onClick={() => { setErr(''); setReason(''); setVoiding(x); }}>Cancel</button></>}
              </td>
            </tr>;
          })}
        </tbody></table></div>}
    </section>
    </>}

    {form && <Modal title={correcting ? `Correct ${form.target.number}` : isExp ? 'Record expense' : 'Record income'} onClose={() => !busy && setForm(null)} width="560px" footer={<Actions label={correcting ? 'Save correction' : 'Save'} form="cash-form" busy={busy} onCancel={() => setForm(null)} />}>
      <form id="cash-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 10 }}>
        {correcting && <p className="muted" style={{ margin: 0, fontSize: 13 }}>The old record is cancelled and a new one booked in its place. Both stay on file.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="form-label">Date<input className="input-field" type="date" required max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="form-label">Amount (TZS)<MoneyInput className="input-field" min="0.01" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        </div>
        <label className="form-label">Category<select className="input-field" required value={f.accountCode} onChange={(e) => setF({ ...f, accountCode: e.target.value })}><option value="">Choose…</option>{(cats.data ?? []).map((c: any) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="form-label">{isExp ? 'Paid to' : 'Received from'}<input className="input-field" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} /></label>
          <MoneyAccountSelect label={isExp ? 'Paid from' : 'Received into'} value={f.cashAccountId} onChange={(id) => setF({ ...f, cashAccountId: id })} hint="Pick the cash box, bank account or wallet the money moved through." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="form-label">Reference<input className="input-field" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Receipt no." /></label>
          <label className="form-label">Note<input className="input-field" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <Attachments value={f.attachments} onChange={(attachments) => setF({ ...f, attachments })} />
        {vatOn && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.includesVat} onChange={(e) => setF({ ...f, includesVat: e.target.checked })} /> Amount includes VAT ({tax.data.vatRate}%){vatPart > 0 ? ` — VAT ${tzs(vatPart)}` : ''}</label>}
        {correcting && <label className="form-label">Why is it being corrected?<input className="input-field" required minLength={5} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>}
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}

    {details && <Modal title={`Details of ${details.number}`} onClose={() => !busy && setDetails(null)} width="520px" footer={<Actions label="Save" form="details-form" busy={busy} onCancel={() => setDetails(null)} />}>
      <form id="details-form" onSubmit={(e) => { e.preventDefault(); void act(() => accountingApi.updateCashTransaction(details.id, d), 'Details saved.').then((ok) => ok && setDetails(null)); }} style={{ display: 'grid', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>These do not change the books. To change the amount, date, category or account, use Correct.</p>
        <label className="form-label">{isExp ? 'Paid to' : 'Received from'}<input className="input-field" value={d.party} onChange={(e) => setD({ ...d, party: e.target.value })} /></label>
        <label className="form-label">Reference<input className="input-field" value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} /></label>
        <label className="form-label">Note<input className="input-field" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
        <Attachments value={d.attachments} onChange={(attachments) => setD({ ...d, attachments })} />
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}

    {voiding && <Modal title={`Cancel ${voiding.number}`} onClose={() => !busy && setVoiding(null)} width="460px" footer={<Actions label="Cancel record" form="void-cash-form" busy={busy} onCancel={() => setVoiding(null)} />}>
      <form id="void-cash-form" onSubmit={(e) => { e.preventDefault(); void act(() => accountingApi.voidCashTransaction(voiding.id, reason)).then((ok) => { if (ok) { setVoiding(null); setReason(''); } }); }} style={{ display: 'grid', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{tzs(voiding.amount)} · {voiding.category}. The record stays, marked cancelled.</p>
        <label className="form-label">Reason<input className="input-field" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}

    {rejecting && <Modal title={`Reject ${rejecting.number}`} onClose={() => !busy && setRejecting(null)} width="460px" footer={<Actions label="Reject expense" form="reject-cash-form" busy={busy} onCancel={() => setRejecting(null)} />}>
      <form id="reject-cash-form" onSubmit={(e) => { e.preventDefault(); void act(() => accountingApi.rejectCashTransaction(rejecting.id, reason)).then((ok) => { if (ok) { setRejecting(null); setReason(''); } }); }} style={{ display: 'grid', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{tzs(rejecting.amount)} · {rejecting.category}. Nothing was booked, and nothing will be.</p>
        <label className="form-label">Reason<input className="input-field" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{err}</div>}
      </form>
    </Modal>}
  </div>;
}
