'use client';
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { tzs } from '@/lib/ops';
import { Field, FormGrid, ErrorNote, useAction } from './ui';
import CustomerModal, { type Customer } from './CustomerModal';

interface Product { id: string; code: string; name: string; brand: string | null; unit: string; unitPrice: number | null; taxRatePercent: number; packSizeKg: number | null; category: string }
interface Line { productId: string; quantity: string; unitPrice: string; discountPercent: string }
const emptyLine = (): Line => ({ productId: '', quantity: '', unitPrice: '', discountPercent: '' });

export const calc = (l: { quantity: number; unitPrice: number; discountPercent?: number }, tax: number) => {
  const gross = Math.round(l.quantity * l.unitPrice * 100) / 100;
  const disc = Math.round(gross * ((l.discountPercent ?? 0) / 100) * 100) / 100;
  const net = gross - disc;
  const t = Math.round(net * (tax / 100) * 100) / 100;
  return { gross, disc, tax: t, total: Math.round((net + t) * 100) / 100 };
};

/** Used for quotations and for orders (new, or corrected after accounts returned it). */
export default function NewDocModal({ kind, existing, fromQuotation, onClose, onSaved }: {
  kind: 'quotation' | 'order';
  existing?: { id: string; customerId: string; lines: { productId: string; quantity: number; unitPrice: number; discountPercent: number }[]; deliveryMode?: string | null; deliveryNote?: string | null; notes?: string | null; validUntil?: string | null } | null;
  fromQuotation?: { id: string; customerId: string; lines: { productId: string; quantity: number; unitPrice: number; discountPercent: number }[]; deliveryMode?: string | null; deliveryNote?: string | null; notes?: string | null } | null;
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const seed = existing ?? fromQuotation ?? null;
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState(seed?.customerId ?? '');
  const [lines, setLines] = useState<Line[]>(seed ? seed.lines.map((l) => ({ productId: l.productId, quantity: String(l.quantity), unitPrice: String(l.unitPrice), discountPercent: l.discountPercent ? String(l.discountPercent) : '' })) : [emptyLine()]);
  const [mode, setMode] = useState(seed?.deliveryMode ?? 'COLLECTION');
  const [note, setNote] = useState(seed?.deliveryNote ?? '');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [validUntil, setValidUntil] = useState(existing?.validUntil?.slice(0, 10) ?? '');
  const [avail, setAvail] = useState<Record<string, number>>({});
  const [newCustomer, setNewCustomer] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => { opsApi.products({ active: 'true' }).then((r) => setProducts((r.data as Product[]).filter((p) => p.category !== 'BYPRODUCT'))); }, []);
  useEffect(() => { opsApi.customers({ q: search || undefined }).then((r) => setCustomers(r.data)); }, [search]);
  useEffect(() => {
    const ids = [...new Set(lines.map((l) => l.productId).filter(Boolean))];
    if (ids.length) opsApi.availability(ids).then((r) => setAvail(r.data)).catch(() => undefined);
  }, [lines]);

  const prod = (id: string) => products.find((p) => p.id === id);
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const next = { ...l, [k]: v };
    if (k === 'productId') next.unitPrice = String(prod(v)?.unitPrice ?? '');
    return next;
  }));
  const totals = useMemo(() => {
    let sub = 0, disc = 0, tax = 0, total = 0;
    for (const l of lines) {
      const p = prod(l.productId);
      if (!p || !Number(l.quantity) || l.unitPrice === '') continue;
      const c = calc({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || 0 }, p.taxRatePercent);
      sub += c.gross; disc += c.disc; tax += c.tax; total += c.total;
    }
    return { sub, disc, tax, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, products]);
  const valid = customerId && lines.length > 0 && lines.every((l) => l.productId && Number(l.quantity) > 0 && l.unitPrice !== '');

  const save = async () => {
    const payload = {
      customerId, deliveryMode: mode, deliveryNote: note.trim() || undefined, notes: notes.trim() || undefined, ...(kind === 'quotation' && validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
      lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || 0 })),
      ...(fromQuotation ? { quotationId: fromQuotation.id } : {}),
    };
    const r = await run(async () => {
      if (kind === 'quotation') return opsApi.saveQuotation(payload, existing?.id);
      if (existing) { const u = await opsApi.updateOrder(existing.id, payload); await opsApi.resubmitOrder(existing.id); return u; }
      return opsApi.createOrder(payload);
    });
    if (r) onSaved((r.data as { id: string }).id);
  };

  const title = kind === 'quotation' ? (existing ? 'Edit quotation' : 'New quotation') : existing ? 'Correct and resubmit order' : fromQuotation ? 'Create order from quotation' : 'New customer order';
  return (
    <Modal title={title} subtitle={kind === 'order' ? 'The order goes to accounts for review. It is not paid or released until accounts say so.' : 'A quotation does not reserve stock.'} width="860px" onClose={onClose}
      footer={<><button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy ? 'Saving…' : kind === 'order' ? (existing ? 'Resubmit to accounts' : 'Send to accounts') : 'Save quotation'}</button></>}>
      <ErrorNote message={error} />
      <div style={{ display: 'grid', gap: 14 }}>
        {!existing && !fromQuotation && (
          <Field label="Customer" hint="Search by name, phone, reference or TIN.">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input-field" type="search" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="button" className="btn-secondary" onClick={() => setNewCustomer(true)}>+ New customer</button>
            </div>
            <select className="input-field" size={4} value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ marginTop: 6 }}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.reference} · {c.phone}</option>)}
            </select>
          </Field>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Quantity</th><th style={{ textAlign: 'right' }}>Unit price</th><th style={{ textAlign: 'right' }}>Discount %</th><th style={{ textAlign: 'right' }}>Tax %</th><th style={{ textAlign: 'right' }}>Total</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const p = prod(l.productId);
                const c = p && Number(l.quantity) && l.unitPrice !== '' ? calc({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || 0 }, p.taxRatePercent) : null;
                const needKg = p && Number(l.quantity) ? Number(l.quantity) * (p.unit !== 'kg' && p.packSizeKg ? p.packSizeKg : 1) : 0;
                const have = l.productId ? avail[l.productId] : undefined;
                return (
                  <tr key={i}>
                    <td style={{ minWidth: 230 }}>
                      <select className="input-field" value={l.productId} onChange={(e) => set(i, 'productId', e.target.value)}>
                        <option value="">Choose product…</option>
                        {products.map((p2) => <option key={p2.id} value={p2.id}>{p2.name}{p2.brand ? ` · ${p2.brand}` : ''}{p2.packSizeKg ? ` · ${p2.packSizeKg} kg` : ''}</option>)}
                      </select>
                      {p && have != null && <div style={{ fontSize: 11, color: needKg > have ? 'var(--red-500)' : 'var(--neutral-500)' }}>{have.toLocaleString()} kg available{needKg > have ? ` — short by ${(needKg - have).toLocaleString()} kg` : ''}</div>}
                    </td>
                    <td><input className="input-field" style={{ width: 90, textAlign: 'right' }} type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} /><div style={{ fontSize: 11, color: 'var(--neutral-500)', textAlign: 'right' }}>{p?.unit ?? ''}</div></td>
                    <td><input className="input-field" style={{ width: 110, textAlign: 'right' }} type="number" min="0" value={l.unitPrice} onChange={(e) => set(i, 'unitPrice', e.target.value)} /></td>
                    <td><input className="input-field" style={{ width: 70, textAlign: 'right' }} type="number" min="0" max="100" value={l.discountPercent} onChange={(e) => set(i, 'discountPercent', e.target.value)} /></td>
                    <td style={{ textAlign: 'right' }}>{p?.taxRatePercent ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{c ? tzs(c.total) : '—'}</td>
                    <td>{lines.length > 1 && <button type="button" className="btn-secondary" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">×</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ Add product</button>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div>Subtotal {tzs(totals.sub)} · Discount − {tzs(totals.disc)} · Tax {tzs(totals.tax)}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Total {tzs(totals.total)}</div>
          </div>
        </div>
        <FormGrid>
          <Field label="Collection or delivery"><select className="input-field" value={mode} onChange={(e) => setMode(e.target.value)}><option value="COLLECTION">Customer collects</option><option value="DELIVERY">Mayode delivers</option></select></Field>
          <Field label={mode === 'DELIVERY' ? 'Delivery address' : 'Collection details'}><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {kind === 'quotation' && <Field label="Valid until"><input className="input-field" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>}
          <Field label="Notes" wide><input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </FormGrid>
      </div>
      {newCustomer && <CustomerModal onClose={() => setNewCustomer(false)} onSaved={(c) => { setCustomers((cs) => [c, ...cs]); setCustomerId(c.id); setNewCustomer(false); }} />}
    </Modal>
  );
}
