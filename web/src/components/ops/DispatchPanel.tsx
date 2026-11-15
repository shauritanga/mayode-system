'use client';
import { useState, type ReactNode } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { dateTime, day, downloadBlob, kg, label, openBlob } from '@/lib/ops';
import { DataTable, ErrorNote, Facts, Field, FormGrid, Loading, Status, Tabs, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Where an order stands in plain words, and the one thing to do next. */
function stage(o: any): { text: string; action: string } {
  if (o.fulfilState === 'SHORTAGE') return { text: 'Not enough stock. Accounts have been told.', action: 'Open' };
  if (o.fulfilState === 'ALLOCATED') return { text: 'Stock chosen. Add the vehicle and release.', action: 'Continue' };
  if (o.fulfilState === 'PARTIALLY_DISPATCHED') return { text: `Part sent. ${kg(o.outstandingKg)} still to send.`, action: 'Continue' };
  return { text: 'New. Choose the stock to send.', action: 'Start' };
}

export default function DispatchPanel({ canAllocate, canRelease, canCancel }: { canAllocate: boolean; canRelease: boolean; canCancel: boolean }) {
  const [sub, setSub] = useState<'queue' | 'dispatches'>('queue');
  const [order, setOrder] = useState<string | null>(null);
  const [dispatch, setDispatch] = useState<string | null>(null);
  const queue = useLoad<any[]>(() => opsApi.dispatchQueue());
  const list = useLoad<any[]>(() => opsApi.dispatches());
  const reload = () => { queue.reload(); list.reload(); };
  return (
    <>
      <Tabs tabs={[{ id: 'queue', label: `Orders to send${queue.data?.length ? ` (${queue.data.length})` : ''}` }, { id: 'dispatches', label: 'Already sent' }]} value={sub} onChange={setSub} />
      {sub === 'queue' ? (
        <>
          <ErrorNote message={queue.error} />
          {queue.loading && !queue.data ? <Loading /> : (
            <DataTable rows={queue.data ?? []} rowKey={(o) => o.id} onRow={(o) => setOrder(o.id)} empty="No orders are waiting. When accounts confirm a payment, the order appears here."
              columns={[{ header: 'Order', render: (o) => <strong>{o.reference}</strong> }, { header: 'Customer', render: (o) => o.customer.name },
                { header: 'Collection', render: (o) => label(o.deliveryMode) }, { header: 'Still to send', align: 'right', render: (o) => <strong>{kg(o.outstandingKg)}</strong> },
                { header: 'Where it is', render: (o) => stage(o).text },
                { header: '', align: 'right', render: (o) => <button type="button" className="btn-primary" onClick={(e) => { e.stopPropagation(); setOrder(o.id); }}>{stage(o).action}</button> }]} />
          )}
        </>
      ) : (
        <>
          <ErrorNote message={list.error} />
          {list.loading && !list.data ? <Loading /> : (
            <DataTable rows={list.data ?? []} rowKey={(d) => d.id} onRow={(d) => setDispatch(d.id)} empty="Nothing has been sent yet."
              columns={[{ header: 'Dispatch', render: (d) => <strong>{d.reference}</strong> }, { header: 'Release note', render: (d) => d.releaseNoteNumber ?? '—' }, { header: 'Order', render: (d) => d.order?.reference ?? '—' },
                { header: 'Customer', render: (d) => d.order?.customer?.name ?? '—' }, { header: 'Vehicle', render: (d) => d.vehiclePlate }, { header: 'Driver', render: (d) => d.driverName }, { header: 'Released', render: (d) => dateTime(d.releasedAt) },
                { header: 'Status', render: (d) => <Status value={d.status} /> }, { header: 'Delivery', render: (d) => <Status value={d.deliveryState} /> }]} />
          )}
        </>
      )}
      {order && <PrepareModal orderId={order} canAllocate={canAllocate} onClose={() => setOrder(null)} onChanged={reload} onOpenDispatch={(id) => { setOrder(null); setSub('dispatches'); setDispatch(id); }} />}
      {dispatch && <DispatchModal id={dispatch} canRelease={canRelease} canCancel={canCancel} onClose={() => setDispatch(null)} onChanged={reload} />}
    </>
  );
}

function PrepareModal({ orderId, canAllocate, onClose, onChanged, onOpenDispatch }: { orderId: string; canAllocate: boolean; onClose: () => void; onChanged: () => void; onOpenDispatch: (id: string) => void }) {
  const { data: v, error: loadError, reload } = useLoad<any>(() => opsApi.prepareView(orderId), [orderId]);
  const { data: lookups } = useLoad<any>(() => opsApi.lookups());
  const [warehouseId, setWarehouseId] = useState('');
  const [picks, setPicks] = useState<Record<string, { batchId: string; qty: string }>>({});
  const [shortage, setShortage] = useState('');
  const [closing, setClosing] = useState('');
  const [trip, setTrip] = useState({ vehiclePlate: '', driverName: '', driverPhone: '', transporter: '', destination: '', supervisorName: '', notes: '' });
  const user = useAuthStore((st) => st.user);
  const canClose = hasPermission(user, 'ops_payments', 'EDIT');
  const { busy, error, run } = useAction();
  const done = async (fn: () => Promise<unknown>) => { const r = await run(fn); if (r !== undefined) { await reload(); onChanged(); } return r; };
  if (!v) return <Modal title="Prepare goods" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const wh = warehouseId || lookups?.warehouses?.[0]?.id || '';
  const liveAllocs = (v.lines as any[]).flatMap((l) => (l.allocations as any[]).filter((a) => a.quantityKg - a.dispatchedKg - a.releasedKg > 0).map((a) => ({ ...a, line: l })));
  const prepared = (v.dispatches as any[]).filter((d) => d.status === 'PREPARED');
  const outstanding = (v.lines as any[]).reduce((t, l) => t + l.outstandingKg, 0);

  const allocateAuto = () => done(() => opsApi.allocate(orderId, { warehouseId: wh, auto: true }));
  const allocateManual = () => done(() => opsApi.allocate(orderId, { warehouseId: wh, lines: Object.entries(picks).filter(([, p]) => p.batchId && Number(p.qty) > 0).map(([orderLineId, p]) => ({ orderLineId, picks: [{ batchId: p.batchId, quantityKg: Number(p.qty) }] })) }));
  const prepareTrip = () => done(async () => {
    const lines = liveAllocs.map((a) => {
      const used = prepared.flatMap((d: any) => d.lines).filter((x: any) => x.orderLineId === a.line.id && x.batchId === a.batchId).reduce((t: number, x: any) => t + x.quantityKg, 0);
      return { orderLineId: a.line.id, batchId: a.batchId, quantityKg: Math.round((a.quantityKg - a.dispatchedKg - a.releasedKg - used) * 1000) / 1000 };
    }).filter((l) => l.quantityKg > 0);
    const r = await opsApi.prepareDispatch(orderId, { warehouseId: liveAllocs[0]?.warehouseId ?? wh, ...trip, driverPhone: trip.driverPhone || undefined, transporter: trip.transporter || undefined, destination: trip.destination || undefined, supervisorName: trip.supervisorName || undefined, notes: trip.notes || undefined, lines });
    return r;
  });

  const covered = (v.lines as any[]).every((l) => l.unallocatedKg <= 0);
  const stepCard = (n: number, title: string, done: boolean, hint: string, body: ReactNode) => (
    <section className={`sd-step${done ? ' is-done' : ''}`}>
      <header><span className="sd-num">{done ? '✓' : n}</span><div><strong>{title}</strong><small>{hint}</small></div></header>
      <div className="sd-body">{body}</div>
    </section>
  );

  return (
    <Modal title={`Send order ${v.reference}`} subtitle={`${v.customer.name} · ${label(v.deliveryMode)}${v.deliveryNote ? ` · ${v.deliveryNote}` : ''}`} width="760px" onClose={onClose}
      footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      <ErrorNote message={error} />
      {v.fulfilState === 'SHORTAGE' && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}><strong>Not enough stock:</strong> {v.shortageNote}</div>}

      {stepCard(1, 'Choose the stock to send', covered, covered ? 'Enough stock is chosen for this order.' : `Still to choose: ${kg((v.lines as any[]).reduce((t, l) => t + l.unallocatedKg, 0))}`, (
        <>
          {canAllocate && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
              <Field label="Take stock from"><select className="input-field" value={wh} onChange={(e) => setWarehouseId(e.target.value)}>{lookups?.warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
              <button className="btn-primary" disabled={busy || !wh || outstanding <= 0 || covered} onClick={allocateAuto}>Choose the stock for me</button>
            </div>
          )}
          {(v.lines as any[]).map((l) => (
            <div key={l.id} className="sd-line">
              <div className="sd-line-head"><strong>{l.product.name}{l.product.brand ? ` · ${l.product.brand}` : ''}</strong><span>Needed {kg(l.requiredKg)} · Chosen {kg(l.allocatedKg)} · Sent {kg(l.dispatchedKg)}</span></div>
              {(l.allocations as any[]).filter((a) => a.quantityKg - a.dispatchedKg - a.releasedKg > 0).map((a) => (
                <div key={a.id} className="sd-alloc">
                  <span>Batch {a.batch.reference}{a.batch.riceVariety ? ` · ${a.batch.riceVariety}` : ''} · {kg(a.quantityKg - a.dispatchedKg - a.releasedKg)}</span>
                  {canAllocate && <button className="btn-secondary" disabled={busy} onClick={() => done(() => opsApi.releaseAllocation(a.id))}>Put back in stock</button>}
                </div>
              ))}
              {canAllocate && l.unallocatedKg > 0 && l.candidates.length > 0 && (
                <div className="sd-pick">
                  <select className="input-field" style={{ flex: 2 }} value={picks[l.id]?.batchId ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [l.id]: { batchId: e.target.value, qty: p[l.id]?.qty ?? String(l.unallocatedKg) } }))}>
                    <option value="">Or choose a batch yourself…</option>{(l.candidates as any[]).map((b) => <option key={b.id} value={b.id}>{b.reference} · {day(b.createdAt)} · {kg(b.availableKg)} free</option>)}</select>
                  <input className="input-field" style={{ flex: 1 }} type="number" placeholder="kg" value={picks[l.id]?.qty ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [l.id]: { batchId: p[l.id]?.batchId ?? '', qty: e.target.value } }))} />
                </div>
              )}
              {l.unallocatedKg > 0 && l.candidates.length === 0 && <p style={{ fontSize: 12, color: 'var(--red-500)', margin: '6px 0 0' }}>No free stock of this product.</p>}
            </div>
          ))}
          {canAllocate && Object.values(picks).some((p) => p.batchId && Number(p.qty) > 0) && <button className="btn-secondary" disabled={busy} onClick={allocateManual}>Use the batches I chose</button>}
        </>
      ))}

      {stepCard(2, 'Add the vehicle and driver', prepared.length > 0, prepared.length > 0 ? 'Done. The goods are ready to be released.' : liveAllocs.length ? 'Who is taking the goods, and in what.' : 'Choose the stock first.', (
        canAllocate && liveAllocs.length > 0 && prepared.length === 0 ? (
          <>
            <FormGrid>
              <Field label="Vehicle plate *"><input className="input-field" value={trip.vehiclePlate} onChange={(e) => setTrip({ ...trip, vehiclePlate: e.target.value })} /></Field>
              <Field label="Driver *"><input className="input-field" value={trip.driverName} onChange={(e) => setTrip({ ...trip, driverName: e.target.value })} /></Field>
              <Field label="Driver’s phone"><input className="input-field" value={trip.driverPhone} onChange={(e) => setTrip({ ...trip, driverPhone: e.target.value })} /></Field>
              <Field label="Transporter"><input className="input-field" value={trip.transporter} onChange={(e) => setTrip({ ...trip, transporter: e.target.value })} /></Field>
              <Field label="Destination"><input className="input-field" value={trip.destination} onChange={(e) => setTrip({ ...trip, destination: e.target.value })} /></Field>
              <Field label="Supervisor"><input className="input-field" value={trip.supervisorName} onChange={(e) => setTrip({ ...trip, supervisorName: e.target.value })} /></Field>
            </FormGrid>
            <button className="btn-primary" style={{ marginTop: 12 }} disabled={busy || !trip.vehiclePlate.trim() || !trip.driverName.trim()} onClick={prepareTrip}>Save vehicle and driver</button>
          </>
        ) : null
      ))}

      {stepCard(3, 'Release the goods', false, prepared.length ? 'Release when the vehicle is loaded. This makes the release note.' : 'Add the vehicle first.', (
        prepared.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {prepared.map((d: any) => (
              <div key={d.id} className="sd-alloc"><span>{d.reference} · {d.vehiclePlate} · {d.driverName}</span><button className="btn-primary" onClick={() => onOpenDispatch(d.id)}>Release goods</button></div>
            ))}
          </div>
        ) : null
      ))}

      {(v.dispatches as any[]).filter((d: any) => d.status !== 'PREPARED').length > 0 && (
        <>
          <h4 style={{ margin: '18px 0 6px', fontSize: 13 }}>Already sent for this order</h4>
          <DataTable rows={(v.dispatches as any[]).filter((d: any) => d.status !== 'PREPARED')} rowKey={(d: any) => d.id} onRow={(d: any) => onOpenDispatch(d.id)} columns={[{ header: 'Sent on', render: (d: any) => dateTime(d.releasedAt) }, { header: 'Release note', render: (d: any) => d.releaseNoteNumber ?? '—' }, { header: 'Vehicle', render: (d: any) => d.vehiclePlate }, { header: 'Status', render: (d: any) => <Status value={d.status} /> }, { header: 'Delivery', render: (d: any) => <Status value={d.deliveryState} /> }]} />
        </>
      )}

      {canAllocate && outstanding > 0 && (
        <details className="sd-problems">
          <summary>Something wrong with this order?</summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
            {v.fulfilState !== 'SHORTAGE' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" style={{ flex: 1 }} placeholder="We do not have enough. Tell accounts what is missing" value={shortage} onChange={(e) => setShortage(e.target.value)} />
                <button className="btn-secondary" disabled={busy || !shortage.trim()} onClick={() => done(async () => { const r = await opsApi.reportShortage(orderId, shortage); setShortage(''); return r; })}>Tell accounts</button>
              </div>
            )}
            {canClose && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" style={{ flex: 1 }} placeholder="Why is the order being closed with less than ordered?" value={closing.trim() === '' ? '' : closing} onChange={(e) => setClosing(e.target.value || ' ')} />
                <button className="btn-secondary" disabled={busy || !closing.trim()} onClick={() => done(() => opsApi.closeShort(orderId, closing.trim()))}>Close with less</button>
              </div>
            )}
          </div>
        </details>
      )}
    </Modal>
  );
}

function DispatchModal({ id, canRelease, canCancel, onClose, onChanged }: { id: string; canRelease: boolean; canCancel: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: d, error: loadError, reload } = useLoad<any>(() => opsApi.dispatch(id), [id]);
  const [panel, setPanel] = useState<null | 'cancel' | 'delivery'>(null);
  const [reason, setReason] = useState('');
  const [delivery, setDelivery] = useState({ state: 'DELIVERED', receivedBy: '', note: '' });
  const [shareNote, setShareNote] = useState('');
  const { busy, error, run } = useAction();
  if (!d) return <Modal title="Dispatch" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const act = async (fn: () => Promise<unknown>) => { if ((await run(fn)) !== undefined) { setPanel(null); await reload(); onChanged(); } };
  const pdf = async (download: boolean) => { const r = await run(() => opsApi.releaseNotePdf(id)); if (r) { if (download) downloadBlob(r.data as BlobPart, `${d.releaseNoteNumber ?? d.reference}.pdf`, 'application/pdf'); else openBlob(r.data as BlobPart); } };
  const whatsapp = async () => { const r = await run(() => opsApi.shareDispatch(id)); if (r) { window.open((r.data as any).whatsappLink, '_blank', 'noopener'); setShareNote(`Link: ${(r.data as any).url}`); } };
  return (
    <Modal title={`${d.reference}${d.releaseNoteNumber ? ` · ${d.releaseNoteNumber}` : ''}`} subtitle={`${d.order.reference} · ${d.order.customer.name}`} width="820px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>
        {canCancel && d.status === 'PREPARED' && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => setPanel('cancel')}>Cancel…</button>}
        {canRelease && d.status === 'PREPARED' && <button className="btn-primary" disabled={busy} onClick={() => act(() => opsApi.releaseDispatch(id))}>Release goods</button>}
        {canRelease && d.status === 'RELEASED' && d.deliveryState === 'IN_TRANSIT' && <button className="btn-primary" onClick={() => setPanel('delivery')}>Record delivery…</button>}</>}>
      <ErrorNote message={error} />
      {panel === 'cancel' && <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
        <Field label="Reason" wide><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !reason.trim()} onClick={() => act(() => opsApi.cancelDispatch(id, reason))}>Cancel the dispatch</button></div>}
      {panel === 'delivery' && <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}><FormGrid>
        <Field label="Outcome"><select className="input-field" value={delivery.state} onChange={(e) => setDelivery({ ...delivery, state: e.target.value })}><option value="DELIVERED">Delivered</option><option value="EXCEPTION">Problem on delivery</option></select></Field>
        <Field label="Received by"><input className="input-field" value={delivery.receivedBy} onChange={(e) => setDelivery({ ...delivery, receivedBy: e.target.value })} /></Field>
        <Field label="Note" wide><input className="input-field" value={delivery.note} onChange={(e) => setDelivery({ ...delivery, note: e.target.value })} /></Field></FormGrid>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || (delivery.state === 'DELIVERED' && !delivery.receivedBy.trim())} onClick={() => act(() => opsApi.recordDelivery(id, delivery))}>Save</button></div>}
      <Facts items={[['Status', <Status key="s" value={d.status} />], ['Delivery', <Status key="d" value={d.deliveryState} />], ['Released', dateTime(d.releasedAt)], ['Vehicle', d.vehiclePlate], ['Driver', `${d.driverName}${d.driverPhone ? ` · ${d.driverPhone}` : ''}`], ['Transporter', d.transporter ?? '—'], ['Destination', d.destination ?? '—'], ['Supervisor', d.supervisorName ?? '—'], ['Received by', d.receivedBy ?? '—']]} />
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Goods</h4>
      <DataTable rows={d.lines} rowKey={(l: any) => l.id} columns={[{ header: 'Product', render: (l: any) => l.orderLine?.product?.name ?? '—' }, { header: 'Batch', render: (l: any) => l.batch?.reference ?? '—' }, { header: 'Quantity', align: 'right', render: (l: any) => kg(l.quantityKg) }, { header: 'Packages', align: 'right', render: (l: any) => l.packages ?? '—' }]} />
      {d.releaseNoteNumber && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn-secondary" disabled={busy} onClick={() => pdf(false)}>View release note</button>
          <button className="btn-secondary" disabled={busy} onClick={() => pdf(true)}>Download PDF</button>
          <button className="btn-secondary" disabled={busy} onClick={whatsapp}>Share on WhatsApp</button>
        </div>
      )}
      {shareNote && <p style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{shareNote}</p>}
    </Modal>
  );
}
