'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { dateTime, day, kg, label } from '@/lib/ops';
import { DataTable, ErrorNote, Facts, Field, FormGrid, Loading, Status, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ReceivingPanel({ canCreate, canConfirm, canCancel }: { canCreate: boolean; canConfirm: boolean; canCancel: boolean }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.receipts({ status: status || undefined, q: q || undefined }), [status, q]);
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>Receive paddy</button>}>
        <Field label="Status"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="DRAFT">Waiting to be confirmed</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option></select></Field>
        <Field label="Search"><input className="input-field" placeholder="Receipt, farmer or seller" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} empty="No paddy has been received yet."
          columns={[{ header: 'Receipt', render: (r) => <strong>{r.reference}</strong> }, { header: 'Date', render: (r) => day(r.receivedAt) },
            { header: 'From', render: (r) => (r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}` : r.sellerName ?? (r.farm ? r.farm.name : '—')) },
            { header: 'Source', render: (r) => label(r.sourceType) }, { header: 'Warehouse', render: (r) => r.warehouse.name },
            { header: 'Delivered', align: 'right', render: (r) => kg(r.grossKg) }, { header: 'Rejected', align: 'right', render: (r) => kg(r.rejectedKg) },
            { header: 'Accepted', align: 'right', render: (r) => kg(r.grossKg - r.rejectedKg) }, { header: 'Status', render: (r) => <Status value={r.status} /> }]} />
      )}
      {open && <ReceiptModal id={open} canConfirm={canConfirm} canCancel={canCancel} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewReceiptModal canConfirm={canConfirm} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function ReceiptModal({ id, canConfirm, canCancel, onClose, onChanged }: { id: string; canConfirm: boolean; canCancel: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: r, error: loadError, reload } = useLoad<any>(() => opsApi.receipt(id), [id]);
  const { busy, error, run } = useAction();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  if (!r) return <Modal title="Receipt" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const act = async (fn: () => Promise<unknown>) => { if ((await run(fn)) !== undefined) { setCancelling(false); await reload(); onChanged(); } };
  return (
    <Modal title={`Receipt ${r.reference}`} subtitle={r.product.name} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>
        {r.status === 'DRAFT' && canCancel && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} disabled={busy} onClick={() => setCancelling(true)}>Cancel receipt…</button>}
        {r.status === 'DRAFT' && canConfirm && <button className="btn-primary" disabled={busy} onClick={() => act(() => opsApi.confirmReceipt(id))}>Confirm and add to stock</button>}</>}>
      <ErrorNote message={error} />
      {cancelling && <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
        <Field label="Reason for cancelling" wide><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !reason.trim()} onClick={() => act(() => opsApi.cancelReceipt(id, reason))}>Cancel the receipt</button>
      </div>}
      <Facts items={[
        ['Status', <Status key="s" value={r.status} />], ['Received', dateTime(r.receivedAt)], ['Warehouse', r.warehouse.name],
        ['From', r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName} (${r.farmer.controlNumber})` : r.sellerName ?? '—'], ['Farm', r.farm ? `${r.farm.name} (${r.farm.farmCode})` : '—'], ['Plot', r.plot ? r.plot.name ?? r.plot.plotCode : '—'],
        ['Crop season', r.cropCycle ? `${r.cropCycle.season} · ${r.cropCycle.riceVariety ?? ''}` : '—'], ['Harvest batch', r.harvestBatchRef ?? '—'], ['Variety', r.riceVariety ?? '—'],
        ['Delivered', kg(r.grossKg)], ['Rejected', kg(r.rejectedKg)], ['Accepted', kg(r.grossKg - r.rejectedKg)], ['Bags', r.bags ?? '—'], ['Moisture', r.moisturePct != null ? `${r.moisturePct}%` : '—'],
        ['Quality', r.qualityGrade ?? '—'], ['Inspection', label(r.inspection)], ['Stock batch', r.batch?.reference ?? 'Not created yet'],
      ]} />
      {r.inspectionNotes && <p style={{ fontSize: 13 }}><strong>Inspection notes:</strong> {r.inspectionNotes}</p>}
      {r.cancelReason && <p style={{ fontSize: 13 }}><strong>Cancelled because:</strong> {r.cancelReason}</p>}
    </Modal>
  );
}

function NewReceiptModal({ canConfirm, onClose, onSaved }: { canConfirm: boolean; onClose: () => void; onSaved: () => void }) {
  const { data: lookups } = useLoad<any>(() => opsApi.lookups());
  const { data: products } = useLoad<any[]>(() => opsApi.products({ category: 'PADDY' }));
  const [source, setSource] = useState<'EXTERNAL_FARMER' | 'MAYODE_FARM'>('EXTERNAL_FARMER');
  const [farmerQ, setFarmerQ] = useState('');
  const [allFarmers, setAllFarmers] = useState<any[]>([]);
  const [farmer, setFarmer] = useState<any>(null);
  const [cycles, setCycles] = useState<any[]>([]);
  const [harvests, setHarvests] = useState<any[]>([]);
  const [f, setF] = useState({ warehouseId: '', productId: '', sellerName: '', sellerPhone: '', farmId: '', cropCycleId: '', harvestRecordId: '', riceVariety: '', receivedAt: new Date().toISOString().slice(0, 10), grossKg: '', bags: '', bagWeightKg: '', moisturePct: '', qualityGrade: '', inspection: 'NOT_REQUIRED', rejectedKg: '', inspectionNotes: '', notes: '' });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, run } = useAction();

  useEffect(() => {
    opsApi.searchFarmers('').then((r) => setAllFarmers(r.data)).catch(() => setAllFarmers([]));
  }, []);
  const farmerLabel = (x: any) => `${x.firstName} ${x.lastName} · ${x.controlNumber}${x.village || x.district ? ` · ${x.village ?? x.district}` : ''}`;
  const farmers = allFarmers.filter((x) => !farmerQ.trim() || farmerLabel(x).toLowerCase().includes(farmerQ.trim().toLowerCase()));
  useEffect(() => {
    if (!farmer) { setCycles([]); return; }
    opsApi.farmerRecords(farmer.id).then((r) => setCycles(r.data.cycles)).catch(() => setCycles([]));
  }, [farmer]);
  useEffect(() => {
    if (source !== 'MAYODE_FARM') return;
    opsApi.harvestOptions(f.farmId || undefined).then((r) => setHarvests(r.data)).catch(() => setHarvests([]));
  }, [source, f.farmId]);

  const pickedCycle = cycles.find((c) => c.id === f.cropCycleId);
  const pickedHarvest = harvests.find((h) => h.id === f.harvestRecordId);
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const valid = f.warehouseId && f.productId && Number(f.grossKg) > 0 && (source === 'MAYODE_FARM' ? f.farmId || f.harvestRecordId : farmer || f.sellerName.trim());

  const save = async (confirmNow: boolean) => {
    const body: Record<string, unknown> = {
      warehouseId: f.warehouseId, productId: f.productId, sourceType: source, receivedAt: new Date(f.receivedAt).toISOString(), grossKg: Number(f.grossKg),
      bags: n(f.bags), bagWeightKg: n(f.bagWeightKg), moisturePct: n(f.moisturePct), qualityGrade: f.qualityGrade || undefined, inspection: f.inspection, rejectedKg: n(f.rejectedKg),
      inspectionNotes: f.inspectionNotes || undefined, notes: f.notes || undefined, riceVariety: f.riceVariety || pickedCycle?.riceVariety || pickedHarvest?.riceVariety || undefined, confirmNow,
    };
    if (source === 'EXTERNAL_FARMER') {
      if (farmer) { body.farmerId = farmer.id; if (pickedCycle) { body.cropCycleId = pickedCycle.id; body.farmId = pickedCycle.farm.id; body.plotId = pickedCycle.plot.id; } }
      else { body.sellerName = f.sellerName; body.sellerPhone = f.sellerPhone || undefined; }
    } else {
      body.farmId = f.farmId || pickedHarvest?.farmId; body.harvestRecordId = f.harvestRecordId || undefined;
      if (pickedHarvest) { body.plotId = pickedHarvest.plotId ?? undefined; body.cropCycleId = pickedHarvest.cropCycleId ?? undefined; body.harvestBatchRef = pickedHarvest.batchRef ?? undefined; }
    }
    if ((await run(() => opsApi.createReceipt(body))) !== undefined) onSaved();
  };

  return (
    <Modal title="Receive paddy" subtitle="Record what arrived. Stock is added when the receipt is confirmed." width="820px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-secondary" disabled={busy || !valid} onClick={() => save(false)}>Save as draft</button>
        {canConfirm && <button className="btn-primary" disabled={busy || !valid} onClick={() => save(true)}>{busy ? 'Saving…' : 'Save and add to stock'}</button>}</>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Where did it come from?"><select className="input-field" value={source} onChange={(e) => setSource(e.target.value as typeof source)}><option value="EXTERNAL_FARMER">A farmer</option><option value="MAYODE_FARM">A Mayode farm</option></select></Field>
        <Field label="Warehouse"><select className="input-field" value={f.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}><option value="">Choose…</option>{lookups?.warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Paddy product"><select className="input-field" value={f.productId} onChange={(e) => set('productId', e.target.value)}><option value="">Choose…</option>{products?.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Date received"><input className="input-field" type="date" value={f.receivedAt} onChange={(e) => set('receivedAt', e.target.value)} /></Field>
      </FormGrid>

      {source === 'EXTERNAL_FARMER' ? (
        <div style={{ marginTop: 12 }}>
          {farmer ? (
            <div className="glass-card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><strong>{farmer.firstName} {farmer.lastName}</strong> · {farmer.controlNumber} · {farmer.village ?? farmer.district ?? ''}</span>
              <button className="btn-secondary" onClick={() => { setFarmer(null); setF((x) => ({ ...x, cropCycleId: '' })); }}>Change</button>
            </div>
          ) : (
            <>
              <FormGrid>
                <Field label="Farmer" hint={allFarmers.length >= 1000 ? 'Showing the first 1,000. Type below to narrow the list.' : 'Choose from the list, or type below to narrow it.'}>
                  <select className="input-field" value="" onChange={(e) => { const x = allFarmers.find((y) => y.id === e.target.value); if (x) { setFarmer(x); setFarmerQ(''); } }}>
                    <option value="">{farmers.length ? 'Choose a farmer…' : 'No farmer matches'}</option>
                    {farmers.map((x) => <option key={x.id} value={x.id}>{farmerLabel(x)}</option>)}
                  </select>
                </Field>
                <Field label="Narrow the list"><input className="input-field" placeholder="Name, control number or village" value={farmerQ} onChange={(e) => setFarmerQ(e.target.value)} /></Field>
                <Field label="Or a seller who is not registered"><input className="input-field" placeholder="Seller’s name" value={f.sellerName} onChange={(e) => set('sellerName', e.target.value)} /></Field>
                <Field label="Seller’s phone"><input className="input-field" value={f.sellerPhone} onChange={(e) => set('sellerPhone', e.target.value)} /></Field>
              </FormGrid>
            </>
          )}
          {farmer && cycles.length > 0 && (
            <div style={{ marginTop: 10 }}><Field label="Crop season this rice came from (optional)" wide><select className="input-field" value={f.cropCycleId} onChange={(e) => set('cropCycleId', e.target.value)}>
              <option value="">Not linked</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.season} · {c.farm.name} · {c.plot.name ?? c.plot.plotCode}{c.riceVariety ? ` · ${c.riceVariety}` : ''}</option>)}</select></Field></div>
          )}
        </div>
      ) : (
        <FormGrid>
          <Field label="Mayode farm"><select className="input-field" value={f.farmId} onChange={(e) => { set('farmId', e.target.value); set('harvestRecordId', ''); }}><option value="">Choose…</option>{(lookups?.mayodeFarms ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Harvest record" hint="Links the rice back to the plot and season"><select className="input-field" value={f.harvestRecordId} onChange={(e) => set('harvestRecordId', e.target.value)}><option value="">Not linked</option>{harvests.map((h) => <option key={h.id} value={h.id}>{h.reference} · {kg(h.actualKg)} harvested{h.batchRef ? ` · ${h.batchRef}` : ''}</option>)}</select></Field>
        </FormGrid>
      )}

      <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>Quantity and quality</h4>
      <FormGrid>
        <Field label="Weight delivered (kg)"><input className="input-field" type="number" value={f.grossKg} onChange={(e) => set('grossKg', e.target.value)} /></Field>
        <Field label="Bags"><input className="input-field" type="number" value={f.bags} onChange={(e) => set('bags', e.target.value)} /></Field>
        <Field label="Weight per bag (kg)"><input className="input-field" type="number" value={f.bagWeightKg} onChange={(e) => set('bagWeightKg', e.target.value)} /></Field>
        <Field label="Moisture (%)"><input className="input-field" type="number" value={f.moisturePct} onChange={(e) => set('moisturePct', e.target.value)} /></Field>
        <Field label="Rice variety"><input className="input-field" value={f.riceVariety} onChange={(e) => set('riceVariety', e.target.value)} /></Field>
        <Field label="Quality grade"><input className="input-field" value={f.qualityGrade} onChange={(e) => set('qualityGrade', e.target.value)} /></Field>
        <Field label="Inspection"><select className="input-field" value={f.inspection} onChange={(e) => set('inspection', e.target.value)}><option value="NOT_REQUIRED">Not needed</option><option value="PASSED">Passed</option><option value="PARTIAL">Partly accepted</option><option value="FAILED">Failed, all rejected</option></select></Field>
        <Field label="Rejected (kg)"><input className="input-field" type="number" value={f.rejectedKg} onChange={(e) => set('rejectedKg', e.target.value)} /></Field>
        <Field label="Inspection notes" wide><input className="input-field" value={f.inspectionNotes} onChange={(e) => set('inspectionNotes', e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}
