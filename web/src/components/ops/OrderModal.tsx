'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { dateTime, day, kg, label, openBlob, tzs } from '@/lib/ops';
import { Facts, Field, FormGrid, ErrorNote, Loading, Status, useAction, useLoad } from './ui';
import NewDocModal from './NewDocModal';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Panel = null | 'return' | 'invoice' | 'pay' | 'mobile' | 'control' | 'authorize' | 'cancel' | 'void' | 'revoke' | 'reject';

const EVENT_LABEL: Record<string, string> = {
  'order.created': 'Order created', 'order.approved': 'Approved by accounts', 'order.returned': 'Returned to sales', 'order.resubmitted': 'Resubmitted', 'invoice.issued': 'Invoice issued',
  'invoice.voided': 'Invoice voided', 'payment.confirmed': 'Payment confirmed', 'fulfilment.authorized': 'Released to the warehouse', 'fulfilment.revoked': 'Release withdrawn',
  'order.allocated': 'Stock set aside', 'order.allocation_released': 'Stock returned', 'order.shortage': 'Shortage reported', 'dispatch.prepared': 'Dispatch prepared', 'dispatch.released': 'Goods released',
  'dispatch.delivered': 'Delivered', 'dispatch.exception': 'Delivery problem', 'order.cancelled': 'Order cancelled', 'order.closed_short': 'Closed short',
};

/** One order from start to finish: what was asked, what accounts decided, what was paid, and what left the warehouse. */
export default function OrderModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE') => hasPermission(user, r, a);
  const { data: o, error: loadError, reload } = useLoad<any>(() => opsApi.order(id), [id]);
  const [panel, setPanel] = useState<Panel>(null);
  const [f, setF] = useState({ comment: '', dueDate: '', instructions: '', amount: '', method: 'BANK_TRANSFER', reference: '', paidAt: new Date().toISOString().slice(0, 10), payer: '', phone: '', control: '', reason: '', target: '' });
  const [edit, setEdit] = useState(false);
  const { busy, error, run, setError } = useAction();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  if (!o) return <Modal title="Order" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const invoice = (o.invoices as any[]).find((i) => i.status !== 'VOID');
  const balance = invoice ? Math.round((invoice.total - invoice.amountPaid) * 100) / 100 : 0;
  const pending = invoice ? (invoice.payments as any[]).filter((p) => p.status === 'PENDING') : [];
  const closed = ['CANCELLED', 'COMPLETED'].includes(o.status);
  const done = async (fn: () => Promise<unknown>, after?: () => void) => {
    const r = await run(fn);
    if (r !== undefined) { setPanel(null); after?.(); await reload(); onChanged(); }
  };
  const open = (p: Panel, preset?: Partial<typeof f>) => { setError(''); setPanel(p); if (preset) setF((x) => ({ ...x, ...preset })); };
  const pdf = async () => { const r = await run(() => opsApi.invoicePdf(invoice.id)); if (r) openBlob(r.data as BlobPart); };

  const act = (text: string, onClick: () => void, primary = false, danger = false) => (
    <button key={text} className={primary ? 'btn-primary' : 'btn-secondary'} style={danger ? { color: 'var(--red-500)' } : undefined} disabled={busy} onClick={onClick}>{text}</button>
  );

  const actions: React.ReactNode[] = [];
  if (!closed) {
    if (o.status === 'PENDING_ACCOUNTS_REVIEW' && can('ops_review', 'EDIT')) { actions.push(act('Approve for invoicing', () => done(() => opsApi.reviewOrder(id, 'APPROVE')), true)); actions.push(act('Return to sales…', () => open('return'))); }
    if (o.status === 'RETURNED_TO_SALES' && can('ops_orders', 'EDIT')) actions.push(act('Correct and resubmit…', () => setEdit(true), true));
    if (o.status === 'APPROVED_FOR_INVOICING' && can('ops_review', 'CREATE')) actions.push(act('Issue invoice…', () => open('invoice'), true));
    if (o.status === 'INVOICED' && invoice) {
      if (can('ops_payments', 'CREATE') && balance > 0) { actions.push(act('Record payment…', () => open('pay', { amount: String(balance) }), true)); actions.push(act('Mobile-money prompt…', () => open('mobile', { amount: String(balance), phone: o.customer.phone }))); }
      if (can('ops_payments', 'EDIT') && o.fulfilState === 'NOT_AUTHORIZED') actions.push(act(o.paymentStatus === 'PAID' ? 'Release to warehouse' : 'Release unpaid order…', () => (o.paymentStatus === 'PAID' ? done(() => opsApi.authorize(id)) : open('authorize')), o.paymentStatus === 'PAID'));
      if (can('ops_payments', 'EDIT') && ['AUTHORIZED', 'ALLOCATED', 'SHORTAGE'].includes(o.fulfilState) && !(o.dispatches as any[]).length) actions.push(act('Withdraw release…', () => open('revoke')));
      if (can('ops_review', 'EDIT') && invoice.amountPaid === 0) actions.push(act('Void invoice…', () => open('void'), false, true));
    }
    if (can('ops_orders', 'EDIT') && o.amountPaid === 0 && !(o.dispatches as any[]).length) actions.push(act('Cancel order…', () => open('cancel'), false, true));
  }

  const panelTitle: Record<string, string> = { return: 'Return to sales', invoice: 'Issue invoice', pay: 'Record a payment', mobile: 'Ask the customer to pay by mobile money', control: 'Control number', authorize: 'Release an unpaid order', cancel: 'Cancel the order', void: 'Void the invoice', revoke: 'Withdraw the release', reject: 'Reject the payment' };
  const needsReason = ['return', 'cancel', 'void', 'revoke', 'authorize', 'reject'].includes(panel ?? '');
  const submitPanel = () => {
    switch (panel) {
      case 'return': return done(() => opsApi.reviewOrder(id, 'RETURN', f.comment));
      case 'invoice': return done(() => opsApi.issueInvoice(id, { dueDate: f.dueDate ? new Date(f.dueDate).toISOString() : undefined, paymentInstructions: f.instructions || undefined }));
      case 'pay': return done(() => opsApi.recordPayment(invoice.id, { amount: Number(f.amount), method: f.method, reference: f.reference, paidAt: new Date(f.paidAt).toISOString(), payerName: f.payer || undefined }));
      case 'mobile': return done(() => opsApi.mobilePayment(invoice.id, { phoneNumber: f.phone, amount: Number(f.amount) || undefined }));
      case 'control': return done(() => opsApi.setControlNumber(invoice.id, f.control));
      case 'authorize': return done(() => opsApi.authorize(id, f.reason));
      case 'cancel': return done(() => opsApi.cancelOrder(id, f.reason));
      case 'void': return done(() => opsApi.voidInvoice(invoice.id, f.reason));
      case 'revoke': return done(() => opsApi.revoke(id, f.reason));
      case 'reject': return done(() => opsApi.rejectPayment(f.target, f.reason));
      default: return undefined;
    }
  };
  const submitDisabled = busy || (needsReason && (panel === 'return' ? !f.comment.trim() : !f.reason.trim())) || (panel === 'pay' && (!Number(f.amount) || !f.reference.trim())) || (panel === 'mobile' && !f.phone.trim()) || (panel === 'control' && !f.control.trim());

  return (
    <Modal title={`${o.reference} · ${o.customer.name}`} subtitle={`${o.customer.reference} · ${o.customer.phone}`} width="880px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>{actions}</>}>
      <ErrorNote message={error} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Status value={o.status} /><span className={`badge ${o.paymentStatus === 'PAID' ? 'badge-green' : o.paymentStatus === 'PARTIALLY_PAID' ? 'badge-blue' : 'badge-gold'}`}>{label(o.paymentStatus)}</span><Status value={o.fulfilState} />
      </div>

      {o.status === 'RETURNED_TO_SALES' && o.reviewComment && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}><strong>Returned by accounts:</strong> {o.reviewComment}</div>}
      {o.fulfilState === 'SHORTAGE' && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}><strong>Stock shortage:</strong> {o.shortageNote ?? 'The warehouse cannot fill this order yet.'}</div>}
      {o.authorizationOverride && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}><strong>Released before full payment:</strong> {o.authorizationOverride}</div>}

      {panel && (
        <div className="glass-card" style={{ padding: 14, marginBottom: 14 }}>
          <strong style={{ fontSize: 13 }}>{panelTitle[panel]}</strong>
          <div style={{ marginTop: 10 }}>
            <FormGrid>
              {panel === 'return' && <Field label="What sales needs to correct" wide><input className="input-field" value={f.comment} onChange={(e) => set('comment', e.target.value)} /></Field>}
              {panel === 'invoice' && <>
                <Field label="Due date"><input className="input-field" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
                <Field label="Payment instructions" wide><input className="input-field" placeholder="Bank, account, control number…" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} /></Field>
              </>}
              {panel === 'pay' && <>
                <Field label="Amount received (TZS)" hint={`Balance ${tzs(balance)}`}><input className="input-field" type="number" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
                <Field label="How it was paid"><select className="input-field" value={f.method} onChange={(e) => set('method', e.target.value)}><option value="BANK_TRANSFER">Bank transfer</option><option value="CONTROL_NUMBER">Control number</option><option value="MOBILE_MONEY">Mobile money</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></Field>
                <Field label="Receipt or transaction reference" hint="Can only be used once."><input className="input-field" value={f.reference} onChange={(e) => set('reference', e.target.value)} /></Field>
                <Field label="Date paid"><input className="input-field" type="date" value={f.paidAt} onChange={(e) => set('paidAt', e.target.value)} /></Field>
                <Field label="Paid by"><input className="input-field" value={f.payer} onChange={(e) => set('payer', e.target.value)} /></Field>
              </>}
              {panel === 'mobile' && <>
                <Field label="Customer’s mobile number"><input className="input-field" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Amount (TZS)" hint="The order is marked paid only when the provider confirms it."><input className="input-field" type="number" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
              </>}
              {panel === 'control' && <Field label="Control number received from the bank or GePG" wide><input className="input-field" value={f.control} onChange={(e) => set('control', e.target.value)} /></Field>}
              {needsReason && panel !== 'return' && <Field label={panel === 'authorize' ? 'Why release before full payment? (needs management approval)' : 'Reason'} wide><input className="input-field" value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>}
            </FormGrid>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-primary" disabled={submitDisabled} onClick={submitPanel}>{busy ? 'Working…' : 'Confirm'}</button>
              <button className="btn-secondary" onClick={() => setPanel(null)} disabled={busy}>Back</button>
            </div>
          </div>
        </div>
      )}

      <Facts items={[
        ['Created', `${day(o.createdAt)} by ${o.createdByName ?? '—'}`], ['Collection or delivery', `${label(o.deliveryMode)}${o.deliveryNote ? ` · ${o.deliveryNote}` : ''}`],
        ['Accounts review', o.reviewedAt ? `${label(o.reviewDecision)} by ${o.reviewedByName ?? '—'} on ${day(o.reviewedAt)}` : 'Waiting'],
        ['Released to warehouse', o.authorizedAt ? `${day(o.authorizedAt)} by ${o.authorizedByName ?? '—'}` : 'Not yet'],
      ]} />

      <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>Products</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Quantity</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Disc %</th><th style={{ textAlign: 'right' }}>Tax %</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Dispatched</th></tr></thead>
          <tbody>{(o.lines as any[]).map((l) => (
            <tr key={l.id}><td>{l.product.name}{l.product.brand ? ` · ${l.product.brand}` : ''}</td><td style={{ textAlign: 'right' }}>{l.quantity} {l.product.unit}</td><td style={{ textAlign: 'right' }}>{tzs(l.unitPrice)}</td><td style={{ textAlign: 'right' }}>{l.discountPercent}</td><td style={{ textAlign: 'right' }}>{l.taxRatePercent}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{tzs(l.lineTotal)}</td><td style={{ textAlign: 'right' }}>{kg(l.dispatchedQty)} of {kg(l.requiredKg)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ textAlign: 'right', fontSize: 13, marginTop: 6 }}>Subtotal {tzs(o.subtotal)} · Discount − {tzs(o.discountTotal)} · Tax {tzs(o.taxTotal)} · <strong>Total {tzs(o.total)}</strong> · Paid {tzs(o.amountPaid)}</div>

      {invoice && (
        <>
          <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>Invoice {invoice.invoiceNumber}</h4>
          <Facts items={[['Status', <Status key="s" value={invoice.status} />], ['Total', tzs(invoice.total)], ['Paid', tzs(invoice.amountPaid)], ['Balance', tzs(balance)], ['Due', day(invoice.dueDate)], ['Control number', invoice.controlNumber ?? 'Not set']]} />
          <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={pdf} disabled={busy}>View invoice PDF</button>
            <button className="btn-secondary" onClick={async () => { const r = await run(() => opsApi.invoicePdf(invoice.id)); if (r) { const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = `${invoice.invoiceNumber}.pdf`; a.click(); await opsApi.invoiceShared(invoice.id); } }}>Download for sharing</button>
            {can('ops_payments', 'CREATE') && !invoice.controlNumber && <button className="btn-secondary" onClick={() => open('control')}>Enter control number</button>}
            {can('ops_payments', 'CREATE') && !invoice.controlNumber && <button className="btn-secondary" disabled={busy} onClick={async () => { const r = await run(() => opsApi.requestControlNumber(invoice.id)); if (r) { if ((r.data as any).mode === 'MANUAL') setError((r.data as any).message); await reload(); } }}>Request control number</button>}
          </div>
          {(invoice.payments as any[]).length > 0 && (
            <table className="data-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th /></tr></thead>
              <tbody>{(invoice.payments as any[]).map((p) => (
                <tr key={p.id}><td>{day(p.paidAt ?? p.createdAt)}</td><td>{tzs(p.amount)}</td><td>{label(p.method)} · {p.provider}</td><td>{p.providerReference}</td><td><Status value={p.status} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.status === 'PENDING' && p.provider === 'CLICKPESA' && can('ops_payments', 'CREATE') && <button className="btn-secondary" disabled={busy} onClick={() => done(() => opsApi.reconcilePayment(p.id))}>Check with provider</button>}{' '}
                    {p.status === 'PENDING' && can('ops_payments', 'EDIT') && <button className="btn-secondary" disabled={busy} onClick={() => done(() => opsApi.confirmPayment(p.id))}>Confirm</button>}{' '}
                    {p.status === 'PENDING' && can('ops_payments', 'EDIT') && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => open('reject', { target: p.id })}>Reject</button>}
                  </td></tr>
              ))}</tbody></table>
          )}
          {pending.length > 0 && <p style={{ fontSize: 12, color: 'var(--neutral-500)' }}>A pending payment does not count until the provider or accounts confirm it.</p>}
        </>
      )}

      {(o.dispatches as any[]).length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>Dispatches</h4>
          <table className="data-table"><thead><tr><th>Dispatch</th><th>Release note</th><th>Vehicle</th><th>Released</th><th>Status</th><th>Delivery</th></tr></thead>
            <tbody>{(o.dispatches as any[]).map((d) => <tr key={d.id}><td>{d.reference}</td><td>{d.releaseNoteNumber ?? '—'}</td><td>{d.vehiclePlate}</td><td>{dateTime(d.releasedAt)}</td><td><Status value={d.status} /></td><td><Status value={d.deliveryState} /></td></tr>)}</tbody></table>
        </>
      )}

      <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>History</h4>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
        {(o.events as any[]).map((e) => <li key={e.id}><strong>{EVENT_LABEL[e.type] ?? e.type}</strong> · {dateTime(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ''}{e.note ? ` — ${e.note}` : ''}</li>)}
      </ul>

      {edit && (
        <NewDocModal kind="order" existing={{ id, customerId: o.customerId, lines: (o.lines as any[]).map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent })), deliveryMode: o.deliveryMode, deliveryNote: o.deliveryNote, notes: o.notes }}
          onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); onChanged(); }} />
      )}
    </Modal>
  );
}
