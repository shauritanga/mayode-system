'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { dateTime, kg, label } from '@/lib/ops';
import { DataTable, ErrorNote, Facts, Field, FormGrid, Loading, Status, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ProcessingPanel({ canCreate, canReverse }: { canCreate: boolean; canReverse: boolean }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad<any>(() => opsApi.yieldReport({ from: from || undefined, to: to || undefined }), [from, to]);
  const { data: all, loading: l2, reload: reloadAll } = useLoad<any[]>(() => opsApi.runs({ from: from || undefined, to: to || undefined, kind: kind || undefined }), [from, to, kind]);
  const refresh = () => { reload(); reloadAll(); };
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>Record processing</button>}>
        <Field label="Kind"><select className="input-field" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option><option value="MILLING">Milling</option><option value="PACKAGING">Packaging</option></select></Field>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {data && (
        <div style={{ marginBottom: 14 }}>
          <Facts items={[['Milling runs', data.runs], ['Paddy milled', kg(data.paddyMilledKg)], ['Rice produced', kg(data.milledRiceKg)], ['Average yield', `${data.averageYieldPct}%`], ['Average loss', `${data.averageLossPct}%`], ['Runs needing a look', data.flagged]]} />
        </div>
      )}
      {l2 && !all ? <Loading /> : (
        <DataTable rows={all ?? []} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} empty="Nothing has been processed in this period."
          columns={[{ header: 'Run', render: (r) => <strong>{r.reference}</strong> }, { header: 'Date', render: (r) => dateTime(r.processedAt) }, { header: 'Kind', render: (r) => label(r.kind) }, { header: 'Warehouse', render: (r) => r.warehouse.name },
            { header: 'In', align: 'right', render: (r) => kg(r.inputKg) }, { header: 'Out', align: 'right', render: (r) => kg(r.outputKg) }, { header: 'Loss', align: 'right', render: (r) => `${kg(r.lossKg)} (${r.lossPct}%)` },
            { header: 'Rice yield', align: 'right', render: (r) => (r.kind === 'MILLING' ? `${r.milledYieldPct}%` : '—') }, { header: 'Status', render: (r) => <span style={{ display: 'flex', gap: 6 }}><Status value={r.status} />{r.flagged && <span className="badge badge-red">Check</span>}</span> }]} />
      )}
      {open && <RunModal id={open} canReverse={canReverse} onClose={() => setOpen(null)} onChanged={refresh} />}
      {creating && <NewRunModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
    </>
  );
}

function RunModal({ id, canReverse, onClose, onChanged }: { id: string; canReverse: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: r, error: loadError, reload } = useLoad<any>(() => opsApi.run(id), [id]);
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  if (!r) return <Modal title="Processing run" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const submit = async () => { if ((await run(() => opsApi.reverseRun(id, reason))) !== undefined) { setReversing(false); await reload(); onChanged(); } };
  return (
    <Modal title={`Run ${r.reference}`} subtitle={`${label(r.kind)} · ${r.warehouse.name}`} width="780px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>{canReverse && r.status === 'COMPLETED' && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => setReversing(true)}>Reverse run…</button>}</>}>
      <ErrorNote message={error} />
      {reversing && <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
        <Field label="Reason for reversing" wide><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !reason.trim()} onClick={submit}>Reverse</button>
      </div>}
      <Facts items={[['Status', <Status key="s" value={r.status} />], ['When', dateTime(r.processedAt)], ['Machine', r.machine ?? '—'], ['Operator', r.operatorName ?? '—'], ['Input', kg(r.inputKg)], ['Output', kg(r.outputKg)], ['Loss', `${kg(r.lossKg)} (${r.lossPct}%)`], ['Rice yield', r.kind === 'MILLING' ? `${r.milledYieldPct}%` : '—']]} />
      {r.lossNote && <p style={{ fontSize: 13 }}><strong>Loss explained:</strong> {r.lossNote}</p>}
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Went in</h4>
      <DataTable rows={r.inputs} rowKey={(i: any) => i.id} columns={[{ header: 'Batch', render: (i: any) => i.batch.reference }, { header: 'Product', render: (i: any) => i.batch.product.name }, { header: 'Quantity', align: 'right', render: (i: any) => kg(i.quantityKg) }]} />
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Came out</h4>
      <DataTable rows={r.outputs} rowKey={(o: any) => o.id} columns={[{ header: 'Output', render: (o: any) => o.product?.name ?? label(o.kind) }, { header: 'Kind', render: (o: any) => label(o.kind) }, { header: 'Quantity', align: 'right', render: (o: any) => kg(o.quantityKg) }, { header: 'New batch', render: (o: any) => r.batches.find((b: any) => b.outputKind === o.kind)?.reference ?? '—' }]} />
    </Modal>
  );
}

interface Out { kind: string; productId: string; quantityKg: string }
function NewRunModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: lookups } = useLoad<any>(() => opsApi.lookups());
  const { data: products } = useLoad<any[]>(() => opsApi.products());
  const [kind, setKind] = useState<'MILLING' | 'PACKAGING'>('MILLING');
  const [warehouseId, setWarehouseId] = useState('');
  const { data: batches } = useLoad<any[]>(() => opsApi.batches({ inStock: 'true', warehouseId: warehouseId || undefined }), [warehouseId]);
  const [inputs, setInputs] = useState<{ batchId: string; quantityKg: string }[]>([{ batchId: '', quantityKg: '' }]);
  const [outputs, setOutputs] = useState<Out[]>([{ kind: 'PRODUCT', productId: '', quantityKg: '' }]);
  const [machine, setMachine] = useState('');
  const [operator, setOperator] = useState('');
  const [lossNote, setLossNote] = useState('');
  const { busy, error, run } = useAction();

  const wantCategory = kind === 'MILLING' ? 'PADDY' : 'PROCESSED';
  const usable = (batches ?? []).filter((b) => b.product.category === wantCategory && b.availableKg > 0);
  const inKg = inputs.reduce((t, i) => t + (Number(i.quantityKg) || 0), 0);
  const outKg = outputs.reduce((t, o) => t + (Number(o.quantityKg) || 0), 0);
  const lossKg = Math.round((inKg - outKg) * 1000) / 1000;
  const prods = (cat: string[]) => (products ?? []).filter((p) => p.isActive && cat.includes(p.category));
  const valid = warehouseId && inputs.every((i) => i.batchId && Number(i.quantityKg) > 0) && outputs.every((o) => Number(o.quantityKg) > 0 && (o.kind !== 'PRODUCT' || o.productId)) && lossKg >= 0;

  const submit = async () => {
    const body = {
      kind, warehouseId, machine: machine || undefined, operatorName: operator || undefined, lossNote: lossNote || undefined,
      inputs: inputs.map((i) => ({ batchId: i.batchId, quantityKg: Number(i.quantityKg) })),
      outputs: outputs.map((o) => ({ kind: o.kind, productId: o.productId || undefined, quantityKg: Number(o.quantityKg) })),
    };
    if ((await run(() => opsApi.createRun(body))) !== undefined) onSaved();
  };

  return (
    <Modal title="Record processing" subtitle="Paddy goes in, rice and by-products come out. The system keeps the link between them." width="860px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !valid} onClick={submit}>{busy ? 'Saving…' : 'Save run'}</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="What was done"><select className="input-field" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setInputs([{ batchId: '', quantityKg: '' }]); setOutputs([{ kind: 'PRODUCT', productId: '', quantityKg: '' }]); }}><option value="MILLING">Milling paddy into rice</option><option value="PACKAGING">Repackaging rice</option></select></Field>
        <Field label="Warehouse"><select className="input-field" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">Choose…</option>{lookups?.warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Machine"><input className="input-field" value={machine} onChange={(e) => setMachine(e.target.value)} /></Field>
        <Field label="Operator"><input className="input-field" value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
      </FormGrid>
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Used</h4>
      {inputs.map((i, n) => (
        <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <select className="input-field" style={{ flex: 2 }} value={i.batchId} onChange={(e) => setInputs((a) => a.map((x, k) => (k === n ? { ...x, batchId: e.target.value } : x)))}>
            <option value="">Choose a batch…</option>{usable.map((b) => <option key={b.id + b.warehouseId} value={b.id}>{b.reference} · {b.product.name}{b.riceVariety ? ` · ${b.riceVariety}` : ''} · {kg(b.availableKg)} free</option>)}</select>
          <input className="input-field" style={{ flex: 1 }} type="number" placeholder="kg" value={i.quantityKg} onChange={(e) => setInputs((a) => a.map((x, k) => (k === n ? { ...x, quantityKg: e.target.value } : x)))} />
          {inputs.length > 1 && <button className="btn-secondary" onClick={() => setInputs((a) => a.filter((_, k) => k !== n))}>Remove</button>}
        </div>
      ))}
      <button className="btn-secondary" onClick={() => setInputs((a) => [...a, { batchId: '', quantityKg: '' }])}>Add another batch</button>
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Produced</h4>
      {outputs.map((o, n) => (
        <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <select className="input-field" style={{ flex: 1 }} value={o.kind} onChange={(e) => setOutputs((a) => a.map((x, k) => (k === n ? { ...x, kind: e.target.value, productId: '' } : x)))}>
            <option value="PRODUCT">Rice</option>{kind === 'MILLING' && <><option value="BROKEN">Broken rice</option><option value="BRAN">Bran</option><option value="HUSK">Husk</option><option value="OTHER">Other</option></>}</select>
          {['PRODUCT', 'BROKEN', 'BRAN', 'HUSK', 'OTHER'].includes(o.kind) && (
            <select className="input-field" style={{ flex: 2 }} value={o.productId} onChange={(e) => setOutputs((a) => a.map((x, k) => (k === n ? { ...x, productId: e.target.value } : x)))}>
              <option value="">{o.kind === 'PRODUCT' ? 'Choose the rice product…' : 'Product (optional)'}</option>{prods(o.kind === 'PRODUCT' ? ['PROCESSED'] : o.kind === 'BROKEN' ? ['BROKEN'] : ['BYPRODUCT']).map((p) => <option key={p.id} value={p.id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>)}</select>
          )}
          <input className="input-field" style={{ flex: 1 }} type="number" placeholder="kg" value={o.quantityKg} onChange={(e) => setOutputs((a) => a.map((x, k) => (k === n ? { ...x, quantityKg: e.target.value } : x)))} />
          {outputs.length > 1 && <button className="btn-secondary" onClick={() => setOutputs((a) => a.filter((_, k) => k !== n))}>Remove</button>}
        </div>
      ))}
      <button className="btn-secondary" onClick={() => setOutputs((a) => [...a, { kind: 'PRODUCT', productId: '', quantityKg: '' }])}>Add another output</button>
      <div className={`alert-box ${lossKg < 0 ? 'alert-danger' : ''}`} style={{ marginTop: 12, fontSize: 13 }}>
        In {kg(inKg)} · Out {kg(outKg)} · {lossKg < 0 ? 'More came out than went in. Recheck the weights.' : `Loss ${kg(lossKg)}${inKg ? ` (${Math.round((lossKg / inKg) * 10000) / 100}%)` : ''}`}
      </div>
      <div style={{ marginTop: 10 }}><Field label="Explain any loss" wide><input className="input-field" value={lossNote} onChange={(e) => setLossNote(e.target.value)} /></Field></div>
    </Modal>
  );
}
