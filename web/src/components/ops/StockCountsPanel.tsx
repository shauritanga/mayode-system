'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { day } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, Status, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function StockCountsPanel({ canStart, canApprove }: { canStart: boolean; canApprove: boolean }) {
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.stockCounts().then((r) => r.data), []);
  const { data: lookups } = useLoad<any>(() => opsApi.lookups().then((r) => r.data), []);
  const [count, setCount] = useState<any>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const { busy, error: actionError, run } = useAction();
  const start = async () => { const r = await run(() => opsApi.createStockCount({ warehouseId, blind: true })); if (r?.data) setCount(r.data); };
  const save = async () => {
    for (const line of count.lines) {
      if (line.countedKg === '' || line.countedKg == null || Number(line.countedKg) < 0) return;
      const result = await run(() => opsApi.updateStockCountLine(count.id, line.id, { countedKg: Number(line.countedKg) }));
      if (!result) return;
    }
    if (await run(() => opsApi.submitStockCount(count.id))) { setCount(null); reload(); }
  };
  const approve = async (id: string) => { if (await run(() => opsApi.approveStockCount(id))) reload(); };
  const resume = async (id: string) => { const r = await run(() => opsApi.stockCount(id)); if (r?.data) setCount(r.data); };
  return <>
    {canStart && <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 16 }}><Field label="Warehouse"><select className="input-field" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">Choose warehouse</option>{lookups?.warehouses?.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field><button className="btn-primary" disabled={!warehouseId || busy} onClick={start}>Start blind count</button></div>}
    <ErrorNote message={error || actionError} />{loading && !data ? <Loading /> : <DataTable rows={data ?? []} rowKey={(r) => r.id} empty="No stock counts have been started." columns={[
      { header: 'Reference', render: (r) => <strong>{r.reference}</strong> }, { header: 'Warehouse', render: (r) => r.warehouse?.name ?? '—' }, { header: 'Started', render: (r) => day(r.createdAt) }, { header: 'Lines', align: 'right', render: (r) => r._count?.lines ?? 0 }, { header: 'Status', render: (r) => <Status value={r.status} /> },
      { header: '', render: (r) => <span style={{ display: 'flex', gap: 6 }}>{r.status === 'COUNTING' && canStart && <button className="btn-secondary" disabled={busy} onClick={() => void resume(r.id)}>Continue count</button>}{canApprove && r.status === 'PENDING_APPROVAL' && <button className="btn-primary" disabled={busy} onClick={() => void approve(r.id)}>Approve variances</button>}</span> },
    ]} />}
    {count && <Modal title={`Blind stock count · ${count.reference}`} subtitle="Record physical quantities without seeing expected balances. Approval is required before stock changes." onClose={() => setCount(null)} footer={<><button className="btn-secondary" onClick={() => setCount(null)}>Cancel</button><button className="btn-primary" disabled={busy || count.lines.some((l: any) => l.countedKg == null || l.countedKg === '')} onClick={() => void save()}>{busy ? 'Saving…' : 'Submit for approval'}</button></>}>
      <ErrorNote message={actionError} />{count.lines.length === 0 ? <p>No stock batches are recorded in this warehouse.</p> : <div style={{ maxHeight: '60vh', overflow: 'auto' }}>{count.lines.map((line: any, i: number) => <FormGrid key={line.id}><Field label={`${line.batch.reference} · ${line.batch.product.name}`}><input className="input-field" type="number" min="0" step="0.001" placeholder="Physical kg" value={line.countedKg ?? ''} onChange={(e) => setCount((c: any) => ({ ...c, lines: c.lines.map((x: any, ix: number) => ix === i ? { ...x, countedKg: e.target.value } : x) }))} /></Field><Field label="Note"><input className="input-field" value={line.note ?? ''} onChange={(e) => setCount((c: any) => ({ ...c, lines: c.lines.map((x: any, ix: number) => ix === i ? { ...x, note: e.target.value } : x) }))} /></Field></FormGrid>)}</div>}
    </Modal>}
  </>;
}
