'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { dateTime, day, kg, label, tzs } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, Tabs, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function AttendancePanel() {
  const [sub, setSub] = useState<'summary' | 'checkins'>('summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [flagged, setFlagged] = useState(false);
  const summary = useLoad<any[]>(() => opsApi.employeeSummary({ from: from || undefined, to: to || undefined }), [from, to]);
  const rows = useLoad<any[]>(() => opsApi.attendance({ from: from || undefined, to: to || undefined, flagged: flagged ? 'true' : undefined }), [from, to, flagged]);
  return (
    <>
      <Tabs tabs={[{ id: 'summary', label: 'By employee' }, { id: 'checkins', label: 'Check-ins' }]} value={sub} onChange={setSub} />
      <Toolbar>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {sub === 'checkins' && <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />Outside the plot only</label>}
      </Toolbar>
      {sub === 'summary' ? (<>
        <ErrorNote message={summary.error} />
        {summary.loading && !summary.data ? <Loading /> : (
          <DataTable rows={summary.data ?? []} rowKey={(r) => r.userId} empty="No tasks in this period."
            columns={[{ header: 'Employee', render: (r) => <strong>{r.employee ?? '—'}</strong> }, { header: 'Assigned', align: 'right', render: (r) => r.assigned }, { header: 'Completed', align: 'right', render: (r) => r.completed }, { header: 'Overdue', align: 'right', render: (r) => r.overdue },
              { header: 'Returned', align: 'right', render: (r) => r.returned }, { header: 'Rejected', align: 'right', render: (r) => r.rejected }, { header: 'GPS check-ins', align: 'right', render: (r) => r.checkIns }, { header: 'Outside the plot', align: 'right', render: (r) => r.outside }]} />
        )}
      </>) : (<>
        <ErrorNote message={rows.error} />
        {rows.loading && !rows.data ? <Loading /> : (
          <DataTable rows={rows.data ?? []} rowKey={(r) => r.id} empty="No check-ins."
            columns={[{ header: 'When', render: (r) => dateTime(r.serverTime) }, { header: 'Employee', render: (r) => r.employee ?? '—' }, { header: 'Task', render: (r) => `${r.task.reference} · ${r.task.title}` }, { header: 'Where', render: (r) => `${r.task.farm.name}${r.task.plot ? ` · ${r.task.plot.plotCode}` : ''}` },
              { header: 'Type', render: (r) => label(r.kind) }, { header: 'Distance', align: 'right', render: (r) => (r.distanceM != null ? `${Math.round(r.distanceM)} m` : '—') },
              { header: 'Result', render: (r) => (r.withinGeofence == null ? <span className="badge badge-gray">No plot position</span> : r.withinGeofence ? <span className="badge badge-green">On site</span> : <span className="badge badge-red">Outside</span>) }, { header: 'Note', render: (r) => r.note ?? '—' }]} />
        )}
      </>)}
    </>
  );
}

export function InputsPanel({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [sub, setSub] = useState<'stock' | 'usage'>('stock');
  const [edit, setEdit] = useState<any>(null);
  const [move, setMove] = useState<{ item: any; mode: 'in' | 'adjust' } | null>(null);
  const items = useLoad<any[]>(() => opsApi.inputs());
  const moves = useLoad<any[]>(() => opsApi.inputMovements());
  return (
    <>
      <Tabs tabs={[{ id: 'stock', label: 'Stock' }, { id: 'usage', label: 'Movements' }]} value={sub} onChange={setSub} />
      {sub === 'stock' ? (<>
        <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setEdit({})}>New input</button>}>{null}</Toolbar>
        <ErrorNote message={items.error} />
        {items.loading && !items.data ? <Loading /> : (
          <DataTable rows={items.data ?? []} rowKey={(i) => i.id} empty="No inputs yet. Add seed, fertiliser, pesticide and fuel."
            columns={[{ header: 'Input', render: (i) => <strong>{i.name}</strong> }, { header: 'Kind', render: (i) => label(i.type) }, { header: 'In stock', align: 'right', render: (i) => <span style={i.low ? { color: 'var(--red-500)', fontWeight: 600 } : undefined}>{i.balance} {i.unit}</span> },
              { header: 'Reorder at', align: 'right', render: (i) => (i.reorderLevel != null ? `${i.reorderLevel} ${i.unit}` : '—') }, { header: 'Unit cost', align: 'right', render: (i) => (i.unitCost != null ? tzs(i.unitCost) : '—') },
              { header: '', render: (i) => canEdit && <span style={{ display: 'flex', gap: 6 }}><button className="btn-secondary" onClick={() => setMove({ item: i, mode: 'in' })}>Add stock</button><button className="btn-secondary" onClick={() => setMove({ item: i, mode: 'adjust' })}>Correct</button><button className="btn-secondary" onClick={() => setEdit(i)}>Edit</button></span> }]} />
        )}
      </>) : (<>
        <ErrorNote message={moves.error} />
        {moves.loading && !moves.data ? <Loading /> : (
          <DataTable rows={moves.data ?? []} rowKey={(m) => m.id} empty="No movements."
            columns={[{ header: 'When', render: (m) => dateTime(m.createdAt) }, { header: 'Input', render: (m) => m.item.name }, { header: 'Movement', render: (m) => label(m.type) }, { header: 'Quantity', align: 'right', render: (m) => `${m.quantity > 0 ? '+' : ''}${m.quantity} ${m.item.unit}` }, { header: 'Task', render: (m) => (m.task ? `${m.task.reference} · ${m.task.title}` : '—') }, { header: 'Note', render: (m) => m.note ?? '—' }]} />
        )}
      </>)}
      {edit && <InputModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); items.reload(); }} />}
      {move && <MoveModal {...move} onClose={() => setMove(null)} onSaved={() => { setMove(null); items.reload(); moves.reload(); }} />}
    </>
  );
}

function InputModal({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: item.name ?? '', type: item.type ?? 'FERTILIZER', unit: item.unit ?? 'kg', unitCost: item.unitCost != null ? String(item.unitCost) : '', reorderLevel: item.reorderLevel != null ? String(item.reorderLevel) : '' });
  const { busy, error, run } = useAction();
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const submit = async () => { if ((await run(() => opsApi.saveInput({ name: f.name, type: f.type, unit: f.unit, unitCost: n(f.unitCost), reorderLevel: n(f.reorderLevel) }, item.id))) !== undefined) onSaved(); };
  return (
    <Modal title={item.id ? `Edit ${item.name}` : 'New input'} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={submit}>Save</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Name"><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Kind"><select className="input-field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['SEED', 'FERTILIZER', 'PESTICIDE', 'HERBICIDE', 'FUEL', 'OTHER'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field label="Unit"><input className="input-field" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Cost per unit (TZS)"><input className="input-field" type="number" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} /></Field>
        <Field label="Warn when stock falls to"><input className="input-field" type="number" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}

function MoveModal({ item, mode, onClose, onSaved }: { item: any; mode: 'in' | 'adjust'; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState('');
  const [text, setText] = useState('');
  const { busy, error, run } = useAction();
  const submit = async () => { if ((await run(() => (mode === 'in' ? opsApi.stockInInput(item.id, Number(qty), text || undefined) : opsApi.adjustInput(item.id, Number(qty), text)))) !== undefined) onSaved(); };
  return (
    <Modal title={`${mode === 'in' ? 'Add stock of' : 'Correct'} ${item.name}`} subtitle={`${item.balance} ${item.unit} in stock now`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !Number(qty) || (mode === 'adjust' && !text.trim())} onClick={submit}>Save</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label={`Quantity (${item.unit})`} hint={mode === 'adjust' ? 'Use a minus sign to remove' : undefined}><input className="input-field" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label={mode === 'in' ? 'Note (supplier, delivery)' : 'Reason'} wide><input className="input-field" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

export function HarvestsPanel({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [creating, setCreating] = useState(false);
  const [transport, setTransport] = useState<any>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.harvests());
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>Record harvest</button>}>{null}</Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(h) => h.id} empty="No harvests recorded."
          columns={[{ header: 'Harvest', render: (h) => <strong>{h.reference}</strong> }, { header: 'Batch', render: (h) => h.batchRef }, { header: 'Date', render: (h) => day(h.harvestDate) }, { header: 'Where', render: (h) => `${h.farm.name}${h.plot ? ` · ${h.plot.name ?? h.plot.plotCode}` : ''} · ${h.cropCycle.season}` },
            { header: 'Harvested', align: 'right', render: (h) => kg(h.position.actualKg) }, { header: 'Sent', align: 'right', render: (h) => kg(h.position.transportedKg) }, { header: 'Received', align: 'right', render: (h) => kg(h.position.receivedKg) },
            { header: 'Accepted', align: 'right', render: (h) => kg(h.position.acceptedKg) }, { header: 'Rejected', align: 'right', render: (h) => kg(h.position.rejectedKg) }, { header: 'Lost on the way', align: 'right', render: (h) => <span style={h.position.lostInTransitKg > 0 ? { color: 'var(--red-500)' } : undefined}>{kg(h.position.lostInTransitKg)}</span> },
            { header: '', render: (h) => canEdit && h.position.notYetTransportedKg > 0 && <button className="btn-secondary" onClick={() => setTransport(h)}>Declare load sent</button> }]} />
      )}
      {creating && <NewHarvestModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {transport && <TransportModal h={transport} onClose={() => setTransport(null)} onSaved={() => { setTransport(null); reload(); }} />}
    </>
  );
}

function TransportModal({ h, onClose, onSaved }: { h: any; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(String(h.position.notYetTransportedKg));
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const submit = async () => { if ((await run(() => opsApi.declareTransport(h.id, Number(qty), note || undefined))) !== undefined) onSaved(); };
  return (
    <Modal title={`Load leaving the field · ${h.reference}`} subtitle={`${kg(h.position.notYetTransportedKg)} not yet sent`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !(Number(qty) > 0)} onClick={submit}>Save</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Weight sent (kg)"><input className="input-field" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note (vehicle, driver)" wide><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function NewHarvestModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: farms } = useLoad<any[]>(() => opsApi.farms({ active: 'true' }));
  const [f, setF] = useState({ farmId: '', cropCycleId: '', harvestDate: new Date().toISOString().slice(0, 10), estimatedKg: '', actualKg: '', team: '', qualityNotes: '' });
  const { busy, error, run } = useAction();
  const farm = farms?.find((x) => x.id === f.farmId);
  const cycle = farm?.cropCycles.find((c: any) => c.id === f.cropCycleId);
  const submit = async () => {
    const r = await run(() => opsApi.createHarvest({ farmId: f.farmId, cropCycleId: f.cropCycleId, plotId: cycle?.plotId ?? undefined, riceVariety: cycle?.riceVariety ?? undefined, harvestDate: new Date(f.harvestDate).toISOString(), estimatedKg: f.estimatedKg ? Number(f.estimatedKg) : undefined, actualKg: Number(f.actualKg), team: f.team || undefined, qualityNotes: f.qualityNotes || undefined, destination: 'WAREHOUSE' }));
    if (r !== undefined) onSaved();
  };
  return (
    <Modal title="Record a harvest" subtitle="This gives the rice a batch reference that follows it into the warehouse." onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !f.farmId || !f.cropCycleId || !(Number(f.actualKg) > 0)} onClick={submit}>{busy ? 'Saving…' : 'Save harvest'}</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Farm"><select className="input-field" value={f.farmId} onChange={(e) => setF({ ...f, farmId: e.target.value, cropCycleId: '' })}><option value="">Choose…</option>{farms?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Crop season"><select className="input-field" value={f.cropCycleId} onChange={(e) => setF({ ...f, cropCycleId: e.target.value })}><option value="">Choose…</option>{farm?.cropCycles.map((c: any) => <option key={c.id} value={c.id}>{c.season}{c.riceVariety ? ` · ${c.riceVariety}` : ''}</option>)}</select></Field>
        <Field label="Harvest date"><input className="input-field" type="date" value={f.harvestDate} onChange={(e) => setF({ ...f, harvestDate: e.target.value })} /></Field>
        <Field label="Actual weight (kg)"><input className="input-field" type="number" value={f.actualKg} onChange={(e) => setF({ ...f, actualKg: e.target.value })} /></Field>
        <Field label="Estimated weight (kg)"><input className="input-field" type="number" value={f.estimatedKg} onChange={(e) => setF({ ...f, estimatedKg: e.target.value })} /></Field>
        <Field label="Harvest team"><input className="input-field" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></Field>
        <Field label="Quality notes" wide><input className="input-field" value={f.qualityNotes} onChange={(e) => setF({ ...f, qualityNotes: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}
