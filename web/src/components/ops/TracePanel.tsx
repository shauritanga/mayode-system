'use client';
import { useState, type ReactNode } from 'react';
import { opsApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { day, kg, label } from '@/lib/ops';
import { ErrorNote, Field, Toolbar } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
const box = { borderLeft: '3px solid var(--neutral-200)', paddingLeft: 12, marginTop: 8, fontSize: 13 } as const;

function Back({ n }: { n: any }): ReactNode {
  const s = n.source;
  return (
    <div style={box}>
      <strong>{n.reference}</strong> · {n.product}{n.brand ? ` · ${n.brand}` : ''}{n.variety ? ` · ${n.variety}` : ''} · {day(n.createdAt)}
      {s && (
        <div style={{ marginTop: 4 }}>
          Received {day(s.receivedAt)} as {s.reference}: {kg(s.grossKg)} delivered, {kg(s.rejectedKg)} rejected{s.moisturePct != null ? `, ${s.moisturePct}% moisture` : ''}.
          <br />From {s.farmer ? `${s.farmer.firstName} ${s.farmer.lastName} (${s.farmer.controlNumber}, ${s.farmer.village ?? s.farmer.district ?? ''})` : s.sellerName ?? 'Mayode farm'}
          {s.farm ? ` · ${s.farm.name}` : ''}{s.plot ? ` · plot ${s.plot.name ?? s.plot.plotCode}` : ''}{s.cropCycle ? ` · season ${s.cropCycle.season}` : ''}{s.harvest ? ` · harvest ${s.harvest.reference}` : ''}
          {s.inputsUsed?.length > 0 && <div>Inputs: {s.inputsUsed.map((i: any) => `${i.name} ${i.quantity} ${i.unit ?? ''}`).join('; ')}</div>}
          {s.activities?.length > 0 && <div>Farm work: {s.activities.map((a: any) => `${a.title} (${day(a.completedAt)})`).join('; ')}</div>}
        </div>
      )}
      {n.processing && (
        <div style={{ marginTop: 4 }}>
          Made in {label(n.processing.kind)} run <strong>{n.processing.reference}</strong> on {day(n.processing.processedAt)}: {kg(n.processing.inputKg)} in, {kg(n.processing.outputKg)} out, {kg(n.processing.lossKg)} lost.
          {n.processing.sources.map((x: any) => <div key={x.batch.batchId}>From {kg(x.contributedKg)} of: <Back n={x.batch} /></div>)}
        </div>
      )}
    </div>
  );
}

function Fwd({ n }: { n: any }): ReactNode {
  return (
    <div style={box}>
      <strong>{n.reference}</strong> · {n.product}{n.brand ? ` · ${n.brand}` : ''}
      {n.processedInto?.map((p: any) => <div key={p.run.runId} style={{ marginTop: 4 }}>{kg(p.usedKg)} used in {label(p.run.kind)} run <strong>{p.run.reference}</strong> ({day(p.run.processedAt)}), which produced:{p.products.map((x: any) => <Fwd key={x.batchId} n={x} />)}</div>)}
      {n.dispatched?.map((d: any, i: number) => <div key={i} style={{ marginTop: 4 }}>{kg(d.quantityKg)} sold to <strong>{d.customer.name}</strong> · order {d.order} · dispatch {d.dispatch} · release note {d.releaseNote} · {day(d.releasedAt)} · vehicle {d.vehicle}</div>)}
      {n.reservedForOrders?.map((r: any, i: number) => <div key={i} style={{ marginTop: 4, color: 'var(--neutral-500)' }}>{kg(r.reservedKg)} set aside for {r.customer} (order {r.order})</div>)}
    </div>
  );
}

export default function TracePanel() {
  const [ref, setRef] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const search = async () => {
    setBusy(true); setError('');
    try { setResults((await opsApi.trace(ref)).data); } catch (e) { setResults(null); setError(apiErrorMessage(e, 'Nothing found.')); } finally { setBusy(false); }
  };
  return (
    <>
      <Toolbar>
        <Field label="Batch, receipt, run, dispatch, release note or order number"><input className="input-field" style={{ minWidth: 300 }} value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ref.trim()) search(); }} /></Field>
        <button className="btn-primary" disabled={busy || !ref.trim()} onClick={search}>{busy ? 'Searching…' : 'Trace'}</button>
      </Toolbar>
      <ErrorNote message={error} />
      {results?.map((r) => (
        <div key={r.batchId} className="glass-card" style={{ padding: 14, marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Where it came from</h4><Back n={r.backward} />
          <h4 style={{ margin: '16px 0 4px', fontSize: 14 }}>Where it went</h4><Fwd n={r.forward} />
        </div>
      ))}
    </>
  );
}
