'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the rest of the accounting screens */

import { useState } from 'react';
import { accountingApi } from '@/lib/api';
import Modal from '@/components/Modal';
import ErrorBanner from '@/components/ErrorBanner';
import { Actions, Badge, Card, Head, MoneyAccountSelect, errText, shortDate, today, tzs, useLoad } from './controls';

const payee = (i: { farmerId?: string | null; sellerName?: string | null }) => (i.farmerId ? { farmerId: i.farmerId } : { sellerName: i.sellerName });

// ───────────────────────── Owed to farmers / Farmer statements ─────────────────────────
/** Everyone the cooperative has bought paddy from: what was bought, paid and is still owed, and what they owe back in dues. */
export function FarmerAccountsView({ mode, canCreate }: { mode: 'owed' | 'statements'; canCreate: boolean }) {
  const list = useLoad<any>(() => accountingApi.farmerOwed(), []);
  const [paying, setPaying] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [message, setMessage] = useState('');
  const d = list.data;
  const items: any[] = d?.items ?? [];
  return <div>
    <Head text={mode === 'owed' ? 'What the cooperative still has to pay for the paddy it bought.' : 'Everything between the cooperative and one farmer, in one place.'} />
    {message && <div className="alert-box" style={{ marginBottom: 12 }} role="status">{message} <button type="button" className="btn-secondary" style={{ marginLeft: 8, padding: '0 8px' }} onClick={() => setMessage('')}>OK</button></div>}
    <ErrorBanner message={list.error} onDismiss={() => list.setError('')} />
    {d && <div className="metric-grid" style={{ marginBottom: 16 }}>
      <Card label="We owe farmers" value={tzs(d.totalOwed)} tone={d.totalOwed > 0 ? 'bad' : undefined} hint="For paddy bought and not yet paid for" />
      <Card label="Paid to farmers" value={tzs(d.totalPaid)} />
      <Card label="Farmers owe us" value={tzs(d.totalDebts)} hint="Levies and other dues (Dues → Debts)" />
    </div>}
    <section className="table-panel">
      {list.loading && !d ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !items.length ? (
        <div className="muted" style={{ padding: 28, textAlign: 'center' }}>No paddy has been bought from a farmer yet. When you receive paddy with a price per kg in Warehouse &amp; Inventory → Receive paddy, the farmer appears here.</div>
      ) : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Farmer</th><th>Phone</th><th className="num">Bought</th><th className="num">Paid</th><th className="num">We owe</th><th className="num">They owe us</th><th /></tr></thead><tbody>
        {items.map((i) => <tr key={i.key}>
          <td><strong>{i.name}</strong>{i.memberNumber && <div className="muted" style={{ fontSize: 11 }}>{i.memberNumber}</div>}</td>
          <td>{i.phone ?? '—'}</td>
          <td className="num">{tzs(i.bought)}</td><td className="num">{tzs(i.paid)}</td>
          <td className="num"><strong style={{ color: i.owed > 0 ? 'var(--red-400)' : undefined }}>{tzs(i.owed)}</strong></td>
          <td className="num">{i.debts > 0 ? tzs(i.debts) : '—'}</td>
          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
            {mode === 'owed' && canCreate && i.owed > 0 && <button type="button" className="btn-primary" onClick={() => setPaying(i)}>Pay</button>}{' '}
            <button type="button" className="btn-secondary" onClick={() => setStatement(i)}>Statement</button>
          </td>
        </tr>)}
      </tbody></table></div>}
    </section>
    {paying && <PayModal payee={paying} onClose={() => setPaying(null)} onSaved={(m) => { setPaying(null); setMessage(m); list.reload(); }} />}
    {statement && <StatementModal payee={statement} onClose={() => setStatement(null)} />}
  </div>;
}

// ───────────────────────── Payouts ─────────────────────────
export function PayoutsView({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const payouts = useLoad<any[]>(() => accountingApi.farmerPayouts(), []);
  const owed = useLoad<any>(() => accountingApi.farmerOwed(), []);
  const [choosing, setChoosing] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [cancelling, setCancelling] = useState<any>(null);
  const [message, setMessage] = useState('');
  const reload = () => { payouts.reload(); owed.reload(); };
  const due: any[] = (owed.data?.items ?? []).filter((i: any) => i.owed > 0);
  return <div>
    <Head text="Money paid to farmers for the paddy the cooperative bought." action={canCreate && <button type="button" className="btn-primary" disabled={!due.length} title={due.length ? undefined : 'Nobody is owed anything'} onClick={() => setChoosing(true)}>Pay a farmer</button>} />
    {message && <div className="alert-box" style={{ marginBottom: 12 }} role="status">{message} <button type="button" className="btn-secondary" style={{ marginLeft: 8, padding: '0 8px' }} onClick={() => setMessage('')}>OK</button></div>}
    <ErrorBanner message={payouts.error} onDismiss={() => payouts.setError('')} />
    <section className="table-panel">
      {payouts.loading && !payouts.data ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> : !(payouts.data ?? []).length ? <div className="muted" style={{ padding: 28, textAlign: 'center' }}>No payouts yet. Use “Pay a farmer” when you pay for paddy you bought.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>No.</th><th>Paid to</th><th>Paid from</th><th>Reference</th><th className="num">Amount</th><th /></tr></thead><tbody>
          {(payouts.data ?? []).map((p) => <tr key={p.id} style={p.voided ? { opacity: 0.55 } : undefined}>
            <td>{shortDate(p.date)}</td><td>{p.number}{p.voided && <div style={{ fontSize: 12, color: 'var(--red-400)' }}>Cancelled</div>}</td>
            <td><strong>{p.name}</strong>{p.note && <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>}</td>
            <td className="muted">{p.account ?? '—'}</td><td className="muted">{p.reference ?? '—'}</td>
            <td className="num" style={p.voided ? { textDecoration: 'line-through' } : undefined}>{tzs(p.amount)}</td>
            <td style={{ textAlign: 'right' }}>{canEdit && !p.voided && <button type="button" className="btn-secondary" onClick={() => setCancelling(p)}>Cancel</button>}</td>
          </tr>)}
        </tbody></table></div>}
    </section>
    {choosing && <Modal title="Who are you paying?" subtitle="Only people the cooperative still owes are listed." onClose={() => setChoosing(false)} width="520px" footer={<button type="button" className="btn-secondary" onClick={() => setChoosing(false)}>Close</button>}>
      <div style={{ display: 'grid', gap: 8 }}>
        {due.map((i) => <button key={i.key} type="button" className="btn-secondary" style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'left' }} onClick={() => { setChoosing(false); setPaying(i); }}><span><strong>{i.name}</strong></span><span>{tzs(i.owed)}</span></button>)}
      </div>
    </Modal>}
    {paying && <PayModal payee={paying} onClose={() => setPaying(null)} onSaved={(m) => { setPaying(null); setMessage(m); reload(); }} />}
    {cancelling && <CancelPayoutModal payout={cancelling} onClose={() => setCancelling(null)} onSaved={(m) => { setCancelling(null); setMessage(m); reload(); }} />}
  </div>;
}

function PayModal({ payee: p, onClose, onSaved }: { payee: any; onClose: () => void; onSaved: (message: string) => void }) {
  const [f, setF] = useState({ amount: String(p.owed), paidOn: today(), cashAccountId: '', reference: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await accountingApi.payFarmer({ ...payee(p), amount: Number(f.amount), paidOn: f.paidOn, cashAccountId: f.cashAccountId || undefined, reference: f.reference || undefined, note: f.note || undefined });
      onSaved(`${tzs(Number(f.amount))} paid to ${p.name}. Payout ${r.data.number}.`);
    } catch (e) { setErr(errText(e, 'Could not record the payment.')); } finally { setBusy(false); }
  };
  const left = p.owed - (Number(f.amount) || 0);
  return <Modal title={`Pay ${p.name}`} subtitle={`The cooperative owes ${tzs(p.owed)} for paddy bought`} onClose={() => !busy && onClose()} width="520px" footer={<Actions label="Record payment" form="payout-form" busy={busy} onCancel={onClose} />}>
    <form id="payout-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
      {p.debts > 0 && <div className="alert-box" role="note">This farmer also owes the cooperative <strong>{tzs(p.debts)}</strong> in dues. You may want to collect it, or agree with the farmer to take it off this payment.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="form-label">Amount (TZS)<input className="input-field" type="number" min="0.01" max={p.owed} step="0.01" required autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <span className="muted" style={{ fontSize: 11 }}>{left > 0.004 ? `${tzs(left)} will still be owed` : 'This clears what is owed'}</span></label>
        <label className="form-label">Date<input className="input-field" type="date" max={today()} required value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
      </div>
      <MoneyAccountSelect label="Paid from" value={f.cashAccountId} onChange={(id) => setF({ ...f, cashAccountId: id })} hint="Pick the cash box, bank account or wallet the money came from." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="form-label">Reference (optional)<input className="input-field" value={f.reference} placeholder="Receipt or transaction no." onChange={(e) => setF({ ...f, reference: e.target.value })} /></label>
        <label className="form-label">Note (optional)<input className="input-field" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }} role="alert">{err}</div>}
    </form>
  </Modal>;
}

function CancelPayoutModal({ payout, onClose, onSaved }: { payout: any; onClose: () => void; onSaved: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await accountingApi.voidFarmerPayout(payout.id, reason); onSaved(`${payout.number} cancelled. The money is back in the account and the debt is owed again.`); } catch (e) { setErr(errText(e, 'Could not cancel.')); } finally { setBusy(false); }
  };
  return <Modal title={`Cancel ${payout.number}`} subtitle={`${tzs(payout.amount)} paid to ${payout.name}`} onClose={() => !busy && onClose()} width="480px" footer={<Actions label="Cancel the payout" form="cancel-payout" busy={busy} onCancel={onClose} />}>
    <form id="cancel-payout" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 10 }}>
      <label className="form-label">Why?<input className="input-field" required minLength={5} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {err && <div style={{ color: 'var(--red-400)', fontSize: 13 }} role="alert">{err}</div>}
    </form>
  </Modal>;
}

// ───────────────────────── One farmer's statement ─────────────────────────
function StatementModal({ payee: p, onClose }: { payee: any; onClose: () => void }) {
  const st = useLoad<any>(() => accountingApi.farmerStatement(p.farmerId ? { farmerId: p.farmerId } : { seller: p.sellerName }), [p.key]);
  const s = st.data;
  return <Modal title={`Statement: ${p.name}`} subtitle={s?.payee?.memberNumber ? `Member ${s.payee.memberNumber}${s.payee.phone ? ` · ${s.payee.phone}` : ''}` : undefined} onClose={onClose} width="860px"
    footer={<><button type="button" className="btn-secondary" onClick={onClose}>Close</button><button type="button" className="btn-primary" onClick={() => window.print()} disabled={!s}>Print</button></>}>
    <ErrorBanner message={st.error} onDismiss={() => st.setError('')} />
    {!s ? <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div> : <div style={{ display: 'grid', gap: 18 }}>
      <div className="metric-grid">
        <Card label="Paddy bought" value={tzs(s.bought)} />
        <Card label="Paid to the farmer" value={tzs(s.paid)} />
        <Card label="We still owe" value={tzs(s.owed)} tone={s.owed > 0 ? 'bad' : undefined} />
        <Card label="They owe us (dues)" value={tzs(s.debts)} />
      </div>
      {s.debts > 0 && s.owed > 0 && <div className="alert-box" role="note">Set against each other, the cooperative owes the farmer <strong>{tzs(Math.max(s.net, 0))}</strong>{s.net < 0 ? ` and the farmer owes the cooperative ${tzs(-s.net)}` : ''}.</div>}

      <section><h4 style={{ margin: '0 0 6px' }}>Paddy bought</h4>
        {!s.purchases.length ? <div className="muted">Nothing bought yet.</div> : <table className="data-table"><thead><tr><th>Date</th><th>Receipt</th><th className="num">Kg</th><th className="num">Price per kg</th><th className="num">Amount</th></tr></thead><tbody>
          {s.purchases.map((x: any) => <tr key={x.id}><td>{shortDate(x.date)}</td><td>{x.reference}</td><td className="num">{x.kg.toLocaleString('en-US')}</td><td className="num">{tzs(x.pricePerKg)}</td><td className="num">{tzs(x.value)}</td></tr>)}
        </tbody></table>}</section>

      <section><h4 style={{ margin: '0 0 6px' }}>Payments to the farmer</h4>
        {!s.payouts.length ? <div className="muted">No payments yet.</div> : <table className="data-table"><thead><tr><th>Date</th><th>No.</th><th>Paid from</th><th>Reference</th><th className="num">Amount</th></tr></thead><tbody>
          {s.payouts.map((x: any) => <tr key={x.id} style={x.voided ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}><td>{shortDate(x.date)}</td><td>{x.number}{x.voided && <> <Badge tone="muted">Cancelled</Badge></>}</td><td>{x.account ?? '—'}</td><td>{x.reference ?? '—'}</td><td className="num">{tzs(x.amount)}</td></tr>)}
        </tbody></table>}</section>

      {p.farmerId && <section><h4 style={{ margin: '0 0 6px' }}>What the farmer owes the cooperative</h4>
        {!s.dues.length ? <div className="muted">No dues.</div> : <table className="data-table"><thead><tr><th>Charge</th><th>Charged</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead><tbody>
          {s.dues.map((x: any) => <tr key={x.id}><td>{x.description}</td><td>{shortDate(x.issuedOn)}</td><td>{shortDate(x.dueDate)}</td><td className="num">{tzs(x.amount)}</td><td className="num">{tzs(x.paid + x.waived)}</td><td className="num"><strong>{tzs(x.balance)}</strong></td></tr>)}
        </tbody></table>}</section>}
    </div>}
  </Modal>;
}
