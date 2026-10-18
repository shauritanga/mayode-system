'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { day, label } from '@/lib/ops';
import { DataTable, ErrorNote, Facts, Field, FormGrid, Loading, Status, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function FarmsPanel({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.farms());
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>New Mayode farm</button>}>{null}</Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(f) => f.id} onRow={(f) => setOpen(f.id)} empty="No Mayode farms yet."
          columns={[{ header: 'Farm', render: (f) => <strong>{f.name}</strong> }, { header: 'Code', render: (f) => f.farmCode }, { header: 'Where', render: (f) => [f.village, f.district, f.region].filter(Boolean).join(', ') || '—' },
            { header: 'Size (ha)', align: 'right', render: (f) => f.socialHectares }, { header: 'Plots', align: 'right', render: (f) => f.plots.length }, { header: 'Active seasons', align: 'right', render: (f) => f.activeCycles },
            { header: 'Manager', render: (f) => f.managerName ?? '—' }, { header: 'Status', render: (f) => (f.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>) }]} />
      )}
      {open && <FarmModal id={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewFarmModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function FarmModal({ id, canEdit, onClose, onChanged }: { id: string; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: f, error: loadError, reload } = useLoad<any>(() => opsApi.farm(id), [id]);
  const { data: people } = useLoad<any[]>(() => opsApi.assignees());
  const [plot, setPlot] = useState<null | { name: string; sizeAcres: string; centerLatitude: string; centerLongitude: string }>(null);
  const [cycle, setCycle] = useState<null | { plotId: string; season: string; riceVariety: string; plantingDate: string; expectedHarvest: string; estimatedYieldKg: string }>(null);
  const { busy, error, run } = useAction();
  if (!f) return <Modal title="Farm" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const done = async (fn: () => Promise<unknown>) => { if ((await run(fn)) !== undefined) { setPlot(null); setCycle(null); await reload(); onChanged(); } };
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  return (
    <Modal title={f.name} subtitle={f.farmCode} width="860px" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      <ErrorNote message={error} />
      <Facts items={[['Status', f.isActive ? 'Active' : 'Inactive'], ['Size', `${f.socialHectares} ha`], ['Where', [f.village, f.ward, f.district, f.region].filter(Boolean).join(', ') || '—'], ['Soil', f.soilType ?? '—'], ['Water', f.waterSource ?? '—'], ['Irrigation', f.hasIrrigation ? f.irrigationMethod ?? 'Yes' : 'No']]} />
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '12px 0', flexWrap: 'wrap' }}>
          <Field label="Farm manager"><select className="input-field" value={f.managerUserId ?? ''} onChange={(e) => done(() => opsApi.updateFarm(id, { managerUserId: e.target.value || undefined }))}><option value="">None</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></Field>
          <button className="btn-secondary" disabled={busy} onClick={() => done(() => opsApi.updateFarm(id, { isActive: !f.isActive }))}>{f.isActive ? 'Mark inactive' : 'Mark active'}</button>
        </div>
      )}
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Plots</h4>
      <DataTable rows={f.plots} rowKey={(p: any) => p.id} empty="No plots yet." columns={[{ header: 'Plot', render: (p: any) => <strong>{p.name ?? p.plotCode}</strong> }, { header: 'Code', render: (p: any) => p.plotCode }, { header: 'Acres', align: 'right', render: (p: any) => p.sizeAcres ?? '—' },
        { header: 'Stage', render: (p: any) => label(p.currentStage) }, { header: 'GPS centre', render: (p: any) => (p.centerLatitude != null ? `${p.centerLatitude.toFixed(5)}, ${p.centerLongitude.toFixed(5)}` : 'Not set') }]} />
      {canEdit && !plot && <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setPlot({ name: '', sizeAcres: '', centerLatitude: '', centerLongitude: '' })}>Add a plot</button>}
      {plot && <div className="glass-card" style={{ padding: 12, marginTop: 8 }}><FormGrid>
        <Field label="Plot name"><input className="input-field" value={plot.name} onChange={(e) => setPlot({ ...plot, name: e.target.value })} /></Field>
        <Field label="Size (acres)"><input className="input-field" type="number" value={plot.sizeAcres} onChange={(e) => setPlot({ ...plot, sizeAcres: e.target.value })} /></Field>
        <Field label="Centre latitude" hint="Used to check workers are at the plot"><input className="input-field" type="number" value={plot.centerLatitude} onChange={(e) => setPlot({ ...plot, centerLatitude: e.target.value })} /></Field>
        <Field label="Centre longitude"><input className="input-field" type="number" value={plot.centerLongitude} onChange={(e) => setPlot({ ...plot, centerLongitude: e.target.value })} /></Field></FormGrid>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn-primary" disabled={busy} onClick={() => done(() => opsApi.addPlot(id, { name: plot.name || undefined, sizeAcres: n(plot.sizeAcres), centerLatitude: n(plot.centerLatitude), centerLongitude: n(plot.centerLongitude) }))}>Add plot</button><button className="btn-secondary" onClick={() => setPlot(null)}>Back</button></div></div>}
      <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>Crop seasons</h4>
      <DataTable rows={f.cropCycles} rowKey={(c: any) => c.id} empty="No seasons yet." columns={[{ header: 'Season', render: (c: any) => <strong>{c.season}</strong> }, { header: 'Plot', render: (c: any) => f.plots.find((p: any) => p.id === c.plotId)?.name ?? '—' }, { header: 'Variety', render: (c: any) => c.riceVariety ?? '—' },
        { header: 'Planted', render: (c: any) => day(c.plantingDate) }, { header: 'Expected harvest', render: (c: any) => day(c.expectedHarvest) }, { header: 'Stage', render: (c: any) => label(c.growthStage) }, { header: 'Status', render: (c: any) => <Status value={c.status} /> }]} />
      {canEdit && !cycle && f.plots.length > 0 && <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setCycle({ plotId: f.plots[0].id, season: '', riceVariety: '', plantingDate: '', expectedHarvest: '', estimatedYieldKg: '' })}>Start a crop season</button>}
      {cycle && <div className="glass-card" style={{ padding: 12, marginTop: 8 }}><FormGrid>
        <Field label="Plot"><select className="input-field" value={cycle.plotId} onChange={(e) => setCycle({ ...cycle, plotId: e.target.value })}>{f.plots.map((p: any) => <option key={p.id} value={p.id}>{p.name ?? p.plotCode}</option>)}</select></Field>
        <Field label="Season" hint="For example 2026 Masika"><input className="input-field" value={cycle.season} onChange={(e) => setCycle({ ...cycle, season: e.target.value })} /></Field>
        <Field label="Rice variety"><input className="input-field" value={cycle.riceVariety} onChange={(e) => setCycle({ ...cycle, riceVariety: e.target.value })} /></Field>
        <Field label="Planting date"><input className="input-field" type="date" value={cycle.plantingDate} onChange={(e) => setCycle({ ...cycle, plantingDate: e.target.value })} /></Field>
        <Field label="Expected harvest"><input className="input-field" type="date" value={cycle.expectedHarvest} onChange={(e) => setCycle({ ...cycle, expectedHarvest: e.target.value })} /></Field>
        <Field label="Expected yield (kg)"><input className="input-field" type="number" value={cycle.estimatedYieldKg} onChange={(e) => setCycle({ ...cycle, estimatedYieldKg: e.target.value })} /></Field></FormGrid>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn-primary" disabled={busy || !cycle.season.trim()} onClick={() => done(() => opsApi.newCropCycle({ farmId: id, plotId: cycle.plotId, season: cycle.season, riceVariety: cycle.riceVariety || undefined, plantingDate: cycle.plantingDate ? new Date(cycle.plantingDate).toISOString() : undefined, expectedHarvest: cycle.expectedHarvest ? new Date(cycle.expectedHarvest).toISOString() : undefined, estimatedYieldKg: n(cycle.estimatedYieldKg) }))}>Start season</button><button className="btn-secondary" onClick={() => setCycle(null)}>Back</button></div></div>}
    </Modal>
  );
}

function NewFarmModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: people } = useLoad<any[]>(() => opsApi.assignees());
  const [f, setF] = useState({ name: '', farmCode: '', socialHectares: '', region: '', district: '', ward: '', village: '', centerLatitude: '', centerLongitude: '', soilType: '', waterSource: '', irrigationMethod: '', hasIrrigation: false, managerUserId: '', plots: '' });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, run } = useAction();
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const submit = async () => {
    const count = Math.max(0, Math.min(50, Number(f.plots) || 0));
    const body = { name: f.name, farmCode: f.farmCode || undefined, socialHectares: Number(f.socialHectares), region: f.region || undefined, district: f.district || undefined, ward: f.ward || undefined, village: f.village || undefined,
      centerLatitude: n(f.centerLatitude), centerLongitude: n(f.centerLongitude), soilType: f.soilType || undefined, waterSource: f.waterSource || undefined, irrigationMethod: f.irrigationMethod || undefined, hasIrrigation: f.hasIrrigation,
      managerUserId: f.managerUserId || undefined, plots: Array.from({ length: count }, (_, i) => ({ name: `Plot ${i + 1}` })) };
    if ((await run(() => opsApi.createFarm(body))) !== undefined) onSaved();
  };
  return (
    <Modal title="New Mayode farm" width="760px" onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !f.name.trim() || !(Number(f.socialHectares) > 0)} onClick={submit}>{busy ? 'Saving…' : 'Create farm'}</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Farm name"><input className="input-field" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Code" hint="Leave blank to generate one"><input className="input-field" value={f.farmCode} onChange={(e) => set('farmCode', e.target.value)} /></Field>
        <Field label="Size (hectares)"><input className="input-field" type="number" value={f.socialHectares} onChange={(e) => set('socialHectares', e.target.value)} /></Field>
        <Field label="Number of plots to create"><input className="input-field" type="number" value={f.plots} onChange={(e) => set('plots', e.target.value)} /></Field>
        <Field label="Region"><input className="input-field" value={f.region} onChange={(e) => set('region', e.target.value)} /></Field>
        <Field label="District"><input className="input-field" value={f.district} onChange={(e) => set('district', e.target.value)} /></Field>
        <Field label="Ward"><input className="input-field" value={f.ward} onChange={(e) => set('ward', e.target.value)} /></Field>
        <Field label="Village"><input className="input-field" value={f.village} onChange={(e) => set('village', e.target.value)} /></Field>
        <Field label="Centre latitude"><input className="input-field" type="number" value={f.centerLatitude} onChange={(e) => set('centerLatitude', e.target.value)} /></Field>
        <Field label="Centre longitude"><input className="input-field" type="number" value={f.centerLongitude} onChange={(e) => set('centerLongitude', e.target.value)} /></Field>
        <Field label="Soil type"><input className="input-field" value={f.soilType} onChange={(e) => set('soilType', e.target.value)} /></Field>
        <Field label="Water source"><input className="input-field" value={f.waterSource} onChange={(e) => set('waterSource', e.target.value)} /></Field>
        <Field label="Farm manager"><select className="input-field" value={f.managerUserId} onChange={(e) => set('managerUserId', e.target.value)}><option value="">None yet</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></Field>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.hasIrrigation} onChange={(e) => set('hasIrrigation', e.target.checked)} />Has irrigation</label>
      </FormGrid>
    </Modal>
  );
}
