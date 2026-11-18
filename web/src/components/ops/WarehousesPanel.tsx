'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other warehouse panels */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { Field, Form, FormError, Row, Section } from '@/components/FormKit';
import { inputStockApi, opsApi, warehousesApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { kg } from '@/lib/ops';
import { Keepers, NewWarehouse, type Warehouse } from '@/screens/dashboard/warehouse/page';
import { DataTable, ErrorNote, Loading, useLoad } from './ui';
import { AllStockPanel, InputReceivePanel } from './InputStockPanels';
import { NewReceiptModal } from './ReceivingPanel';

type Can = (resource: string, action?: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE') => boolean;
const BASE = '/dashboard/ops-warehouse/warehouses';
const keeperNames = (w: Warehouse) => w.keepers.map((k) => `${k.user.firstName ?? ''} ${k.user.lastName ?? ''}`.trim()).filter(Boolean);

/** Everything the two screens need about the warehouses: the places, what rice they hold and what inputs they hold. */
function useWarehouseData(can: Can) {
  const list = useLoad<Warehouse[]>(() => warehousesApi.list(), []);
  const position = useLoad<any[]>(() => (can('ops_stock') ? opsApi.position() : Promise.resolve({ data: [] })), []);
  const inputs = useLoad<any>(() => (can('ops_stock') ? inputStockApi.overview() : Promise.resolve({ data: { data: [], warehouses: [] } })), []);
  const stockOf = useMemo(() => {
    const out = new Map<string, { riceKg: number; freeKg: number; inputItems: number; low: number }>();
    const cell = (id: string) => out.get(id) ?? { riceKg: 0, freeKg: 0, inputItems: 0, low: 0 };
    for (const r of position.data ?? []) {
      if (!['PADDY', 'PROCESSED', 'BROKEN'].includes(r.category)) continue;
      const c = cell(r.warehouseId); c.riceKg += Number(r.closingKg) || 0; c.freeKg += Number(r.availableKg) || 0; if (r.lowStock) c.low += 1; out.set(r.warehouseId, c);
    }
    for (const r of inputs.data?.data ?? []) {
      if (!r.isActive || !r.warehouseId) continue;
      const c = cell(r.warehouseId); if (r.balance > 0) c.inputItems += 1; if (r.low && r.balance > 0) c.low += 1; out.set(r.warehouseId, c);
    }
    return out;
  }, [position.data, inputs.data]);
  const reload = () => { list.reload(); position.reload(); inputs.reload(); };
  return { list, stockOf, reload };
}

// ───────────────────────── the list of warehouses ─────────────────────────
export function WarehouseList({ can }: { can: Can }) {
  const { list, stockOf, reload } = useWarehouseData(can);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const rows = list.data ?? [];
  const statusOf = (w: Warehouse) => {
    const low = (stockOf.get(w.id) ?? { low: 0 }).low;
    return !w.isActive ? <span className="badge badge-gray">Not in use</span> : low > 0 ? <span className="badge badge-red">{low} running low</span> : <span className="badge badge-green">OK</span>;
  };
  return (
    <>
      <div className="wo-title-row" style={{ marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Each place where you keep stock. Open one to see what is in it and to add stock.</p>
        {can('warehouses', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ Add warehouse</button>}
      </div>
      <ErrorNote message={list.error} />
      {list.loading && !list.data ? <Loading /> : rows.length === 0 ? (
        <div className="so-card" style={{ textAlign: 'center', padding: 36 }}>
          <strong>No warehouses yet</strong>
          <p className="muted" style={{ margin: '6px 0 14px' }}>Add the first warehouse, then open it to add stock.</p>
          {can('warehouses', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ Add warehouse</button>}
        </div>
      ) : (
        <>
        <div className="whl-desktop">
          <DataTable rows={rows} rowKey={(w) => w.id} onRow={(w) => router.push(`${BASE}/${w.id}`)} pageSize={15}
            columns={[
              { header: 'Warehouse', render: (w) => <span><strong>{w.name}</strong><div className="muted" style={{ fontSize: 12 }}>{w.location || 'No location set'}</div></span> },
              { header: 'Keeper', render: (w) => keeperNames(w).join(', ') || <span className="muted">None assigned</span> },
              { header: 'Rice and paddy', align: 'right', render: (w) => kg((stockOf.get(w.id) ?? { riceKg: 0 }).riceKg) },
              { header: 'Can be sold now', align: 'right', render: (w) => kg((stockOf.get(w.id) ?? { freeKg: 0 }).freeKg) },
              { header: 'Input items', align: 'right', render: (w) => (stockOf.get(w.id) ?? { inputItems: 0 }).inputItems },
              { header: 'How full', render: (w) => (w.capacityKg ? <span className="whl-fill"><span className="whl-bar"><i style={{ width: `${Math.min(100, ((stockOf.get(w.id)?.riceKg ?? 0) / w.capacityKg) * 100)}%` }} /></span>{Math.round(Math.min(100, ((stockOf.get(w.id)?.riceKg ?? 0) / w.capacityKg) * 100))}%</span> : <span className="muted">—</span>) },
              { header: 'Status', render: (w) => statusOf(w) },
              { header: '', align: 'right', render: (w) => <Link href={`${BASE}/${w.id}`} className="btn-secondary" onClick={(e) => e.stopPropagation()}>Open</Link> },
            ]} />
        </div>
        <div className="whl-grid whl-mobile">
          {rows.map((w) => {
            const s = stockOf.get(w.id) ?? { riceKg: 0, freeKg: 0, inputItems: 0, low: 0 };
            const keepers = keeperNames(w);
            return (
              <Link key={w.id} href={`${BASE}/${w.id}`} className="whl-card">
                <div className="whl-head"><div><strong>{w.name}</strong><span>{w.location || 'No location set'}</span></div>{!w.isActive && <span className="so-pill">Not in use</span>}</div>
                <div className="whl-stats">
                  <div><b>{kg(s.riceKg)}</b><span>Rice and paddy</span></div>
                  <div><b>{s.inputItems}</b><span>{s.inputItems === 1 ? 'Input item' : 'Input items'}</span></div>
                </div>
                {w.capacityKg ? <div className="whl-bar" aria-label="How full"><i style={{ width: `${Math.min(100, (s.riceKg / w.capacityKg) * 100)}%` }} /></div> : null}
                <div className="whl-foot">
                  <span>{keepers.length ? `Keeper: ${keepers.join(', ')}` : 'No keeper assigned'}</span>
                  {s.low > 0 ? <span className="whl-low">{s.low} running low</span> : <span className="whl-open">Open →</span>}
                </div>
              </Link>
            );
          })}
        </div>
        </>
      )}
      {adding && <NewWarehouse onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}

/** Where you are: Warehouses / the warehouse. The first part takes you back to the list. */
function Crumbs({ name }: { name?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="whl-crumbs">
      <Link href={BASE}>Warehouses</Link>
      <span aria-hidden>/</span>
      <span aria-current="page">{name ?? 'Not found'}</span>
    </nav>
  );
}

// ───────────────────────── one warehouse ─────────────────────────
export function WarehouseDetail({ id, can, goto }: { id: string; can: Can; goto: () => void }) {
  const { list, stockOf, reload } = useWarehouseData(can);
  const [dialog, setDialog] = useState<'' | 'edit' | 'keepers' | 'rice' | 'inputs'>('');
  const w = (list.data ?? []).find((x) => x.id === id);
  if (list.loading && !list.data) return <Loading />;
  if (!w) return <><Crumbs /><ErrorNote message={list.error || 'This warehouse was not found.'} /></>;
  const s = stockOf.get(w.id) ?? { riceKg: 0, freeKg: 0, inputItems: 0, low: 0 };
  const keepers = keeperNames(w);
  const done = () => { setDialog(''); reload(); };
  return (
    <>
      <Crumbs name={w.name} />
      <section className="so-card whl-top">
        <div className="whl-title">
          <div>
            <h2>{w.name} {!w.isActive && <span className="so-pill">Not in use</span>}</h2>
            <p className="muted">{w.location || 'No location set'}{w.mamcos ? ` · ${w.mamcos.name}` : ''}</p>
            <p className="muted whl-keepers">{keepers.length ? `Keeper: ${keepers.join(', ')}` : 'No keeper assigned. Anyone with permission can act here.'}</p>
          </div>
          <div className="whl-actions">
            {can('warehouses', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setDialog('keepers')}>Keepers</button>}
            {can('warehouses', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setDialog('edit')}>Edit</button>}
          </div>
        </div>
        <div className="whl-kpis">
          <div><b>{kg(s.riceKg)}</b><span>Rice and paddy in store</span></div>
          <div><b>{kg(s.freeKg)}</b><span>Can be sold now</span></div>
          <div><b>{s.inputItems}</b><span>Input items in store</span></div>
          <div className={s.low ? 'is-low' : ''}><b>{s.low}</b><span>Running low</span></div>
        </div>
        {w.capacityKg ? <div className="whl-bar" aria-label="How full"><i style={{ width: `${Math.min(100, (s.riceKg / w.capacityKg) * 100)}%` }} /></div> : null}
      </section>

      <div className="whl-bar-actions">
        {can('ops_receiving', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setDialog('rice')}>Receive paddy</button>}
        {can('ops_receiving', 'CREATE') && <button type="button" className="btn-secondary" onClick={() => setDialog('inputs')}>Receive inputs, fuel or bags</button>}
        {can('ops_stock', 'CREATE') && <button type="button" className="btn-secondary" onClick={goto}>Count stock</button>}
      </div>

      <h3 className="wo-title" style={{ margin: '22px 0 10px' }}>In this warehouse</h3>
      <AllStockPanel fixedWarehouseId={w.id} canRice={can('ops_stock')} canInputs={can('ops_stock')} canAdjust={can('ops_stock', 'EDIT')} onChanged={reload} />

      {dialog === 'edit' && <EditWarehouse w={w} onClose={() => setDialog('')} onDone={done} />}
      {dialog === 'keepers' && <Keepers warehouse={w} onClose={() => setDialog('')} onDone={reload} />}
      {dialog === 'rice' && <NewReceiptModal canConfirm={can('ops_receiving', 'EDIT')} defaultWarehouseId={w.id} onClose={() => setDialog('')} onSaved={done} />}
      {dialog === 'inputs' && (
        <Modal title={`Add inputs, fuel or bags to ${w.name}`} width="780px" onClose={() => setDialog('')} footer={<button type="button" className="btn-secondary" onClick={done}>Close</button>}>
          <InputReceivePanel canReceive={can('ops_receiving', 'CREATE')} defaultWarehouseId={w.id} onDone={reload} />
        </Modal>
      )}
    </>
  );
}

function EditWarehouse({ w, onClose, onDone }: { w: Warehouse; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: w.name, location: w.location ?? '', capacityKg: w.capacityKg ? String(w.capacityKg) : '', isActive: w.isActive });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    if (f.name.trim().length < 2) { setError('Give the warehouse a name.'); return; }
    setSaving(true); setError('');
    try { await warehousesApi.update(w.id, { name: f.name.trim(), location: f.location.trim() || undefined, capacityKg: f.capacityKg ? Number(f.capacityKg) : undefined, isActive: f.isActive }); onDone(); }
    catch (e) { setError(apiErrorMessage(e, 'Could not save the changes.')); setSaving(false); }
  };
  return (
    <Modal title="Edit warehouse" width="480px" onClose={() => !saving && onClose()}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="wh-edit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></>}>
      <Form id="wh-edit" onSubmit={save}>
        <Section>
          <Field label="Name *"><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Row>
            <Field label="Location" optional><input className="input-field" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
            <Field label="Capacity (kg)" optional><input className="input-field" type="number" min={1} value={f.capacityKg} onChange={(e) => setF({ ...f, capacityKg: e.target.value })} /></Field>
          </Row>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> This warehouse is in use</label>
        </Section>
        <FormError message={error} />
      </Form>
    </Modal>
  );
}
