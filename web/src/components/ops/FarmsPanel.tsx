'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Modal from '@/components/Modal';
import { locationsApi, opsApi } from '@/lib/api';
import { day, label } from '@/lib/ops';
import { DataTable, ErrorNote, Facts, Field, FormGrid, Loading, Status, Tabs, Toolbar, useAction, useLoad } from './ui';
import { areaHectares, centroid, fromPolygon, toPolygon, type Corner } from './BoundaryPicker';
import { hasFarmCenterPin, isFarmBoundaryMapped } from '@/lib/farm-geo';

// Leaflet needs the browser, so the map pieces load on demand.
/** Leaflet gives its layers very high z-indexes; isolating them keeps maps from drawing over windows and menus. */
const Isolated = ({ children }: { children: React.ReactNode }) => <div style={{ isolation: 'isolate' }}>{children}</div>;
const mapLoading = () => <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>Loading map…</div>;
const FarmsMap = dynamic(() => import('@/components/FarmsMap'), { ssr: false, loading: mapLoading });
const FarmBoundaryMap = dynamic(() => import('@/components/FarmBoundaryMap'), { ssr: false, loading: mapLoading });
const BoundaryPicker = dynamic(() => import('./BoundaryPicker'), { ssr: false, loading: mapLoading });

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function FarmsPanel({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.farms());
  const [view, setView] = useState<'list' | 'map'>('list');
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>New Mayode farm</button>}>
        <Tabs tabs={[{ id: 'list', label: 'List' }, { id: 'map', label: 'Map' }]} value={view} onChange={setView} />
      </Toolbar>
      <ErrorNote message={error} />
      {view === 'map' && data && (
        <>
          <Isolated><FarmsMap
            ownFarms
            farms={data.map((f) => ({ ...f, isVerified: true }))}
            renderPopup={(farm: any) => (
              <div style={{ minWidth: 190, lineHeight: 1.5 }}>
                <strong>{farm.name}</strong> · {farm.farmCode}<br />
                {[farm.village, farm.district, farm.region].filter(Boolean).join(', ') || 'Location not set'}<br />
                {farm.socialHectares} ha · {farm.plots.length} plot(s) · {farm.activeCycles} active season(s)<br />
                Manager: {farm.managerName ?? '—'}<br />
                <button type="button" className="btn-secondary" style={{ marginTop: 6 }} onClick={() => setOpen(farm.id)}>Open farm</button>
              </div>
            )}
          /></Isolated>
          {data.some((f) => hasFarmCenterPin(f) && !isFarmBoundaryMapped(f)) && (
            <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 8 }}>
              Farms shown as a blue dot have a GPS point but no boundary yet. Open the farm and choose “Draw boundary” to add one.
            </p>
          )}
        </>
      )}
      {view === 'list' && (loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(f) => f.id} onRow={(f) => setOpen(f.id)} empty="No Mayode farms yet."
          columns={[{ header: 'Farm', render: (f) => <strong>{f.name}</strong> }, { header: 'Code', render: (f) => f.farmCode }, { header: 'Where', render: (f) => [f.village, f.district, f.region].filter(Boolean).join(', ') || '—' },
            { header: 'Size (ha)', align: 'right', render: (f) => f.socialHectares }, { header: 'Plots', align: 'right', render: (f) => f.plots.length }, { header: 'Active seasons', align: 'right', render: (f) => f.activeCycles },
            { header: 'Manager', render: (f) => f.managerName ?? '—' }, { header: 'Status', render: (f) => (f.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>) }]} />
      ))}
      {open && <FarmModal id={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewFarmModal focus={farmPoints(data ?? [])} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function FarmModal({ id, canEdit, onClose, onChanged }: { id: string; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: f, error: loadError, reload } = useLoad<any>(() => opsApi.farm(id), [id]);
  const { data: people } = useLoad<any[]>(() => opsApi.assignees());
  const [plot, setPlot] = useState<null | { name: string; sizeAcres: string; centerLatitude: string; centerLongitude: string }>(null);
  const [drawing, setDrawing] = useState<Corner[] | null>(null);
  const [cycle, setCycle] = useState<null | { plotId: string; season: string; riceVariety: string; plantingDate: string; expectedHarvest: string; estimatedYieldKg: string }>(null);
  const { busy, error, run } = useAction();
  if (!f) return <Modal title="Farm" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const done = async (fn: () => Promise<unknown>) => { if ((await run(fn)) !== undefined) { setPlot(null); setCycle(null); setDrawing(null); await reload(); onChanged(); } };
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
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Location on the map</h4>
      {drawing ? (
        <>
          <Isolated><BoundaryPicker corners={drawing} onChange={setDrawing} center={f.centerLatitude != null ? [f.centerLatitude, f.centerLongitude] : null} /></Isolated>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-primary" disabled={busy || drawing.length < 3} onClick={() => done(() => { const [lat, lng] = centroid(drawing); return opsApi.updateFarm(id, { boundaryCoordinates: toPolygon(drawing), centerLatitude: lat, centerLongitude: lng }); })}>{busy ? 'Saving…' : 'Save boundary'}</button>
            <button className="btn-secondary" onClick={() => setDrawing(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {isFarmBoundaryMapped(f) || hasFarmCenterPin(f)
            ? <Isolated><FarmBoundaryMap farm={f} plots={f.plots} /></Isolated>
            : <p style={{ fontSize: 13, color: 'var(--neutral-500)', margin: 0 }}>This farm has no GPS point or boundary yet.</p>}
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-secondary" onClick={() => setDrawing(fromPolygon(f.boundaryCoordinates))}>{isFarmBoundaryMapped(f) ? 'Redraw boundary' : 'Draw boundary'}</button>
              {isFarmBoundaryMapped(f) && <button className="btn-secondary" disabled={busy} onClick={() => done(() => opsApi.updateFarm(id, { boundaryCoordinates: null }))}>Remove boundary</button>}
            </div>
          )}
        </>
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

/** Every located Mayode farm, as points, so a new farm's map opens where the others are. */
function farmPoints(farms: any[]): Corner[] {
  return farms.flatMap((f) => {
    const ring = fromPolygon(f.boundaryCoordinates);
    return ring.length ? ring : hasFarmCenterPin(f) ? [[f.centerLatitude, f.centerLongitude] as Corner] : [];
  });
}

function NewFarmModal({ focus, onClose, onSaved }: { focus: Corner[]; onClose: () => void; onSaved: () => void }) {
  const { data: people } = useLoad<any[]>(() => opsApi.assignees());
  const [f, setF] = useState({ name: '', farmCode: '', socialHectares: '', region: '', district: '', ward: '', village: '', centerLatitude: '', centerLongitude: '', soilType: '', waterSource: '', irrigationMethod: '', hasIrrigation: false, managerUserId: '', plots: '' });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, run } = useAction();
  // The farm's boundary is drawn on the map; its middle becomes the GPS centre and its area suggests the size.
  const [corners, setCorners] = useState<Corner[]>([]);
  const boundarySize = useRef(false);
  const draw = (c: Corner[]) => {
    setCorners(c);
    if (c.length >= 3) {
      const [lat, lng] = centroid(c);
      setF((x) => ({ ...x, centerLatitude: lat.toFixed(6), centerLongitude: lng.toFixed(6), socialHectares: x.socialHectares && !boundarySize.current ? x.socialHectares : String(Math.round(areaHectares(c) * 100) / 100) }));
      boundarySize.current = true;
    }
  };
  // Region, district and ward come from the location lists; they are saved by name, as on the other farm forms.
  const [regions, setRegions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  useEffect(() => { locationsApi.getRegions().then((r) => setRegions(r.data || [])).catch(() => setRegions([])); }, []);
  useEffect(() => {
    const region = regions.find((r) => r.name === f.region);
    if (!region) { setDistricts([]); return; }
    locationsApi.getDistricts(region.id).then((r) => setDistricts(r.data || [])).catch(() => setDistricts([]));
  }, [regions, f.region]);
  useEffect(() => {
    const district = districts.find((d) => d.name === f.district);
    if (!district) { setWards([]); return; }
    locationsApi.getWards(district.id).then((r) => setWards(r.data || [])).catch(() => setWards([]));
  }, [districts, f.district]);
  const pick = (label: string, key: 'region' | 'district' | 'ward', options: any[], clears: ('district' | 'ward')[]) => (
    <Field label={label}>
      <select className="input-field" value={f[key]} disabled={key !== 'region' && !options.length} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value, ...Object.fromEntries(clears.map((c) => [c, ''])) }))}>
        <option value="">{key !== 'region' && !options.length ? `Choose the ${key === 'district' ? 'region' : 'district'} first` : 'Choose…'}</option>
        {options.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
      </select>
    </Field>
  );
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const submit = async () => {
    const count = Math.max(0, Math.min(50, Number(f.plots) || 0));
    const body = { name: f.name, farmCode: f.farmCode || undefined, socialHectares: Number(f.socialHectares), region: f.region || undefined, district: f.district || undefined, ward: f.ward || undefined, village: f.village || undefined,
      centerLatitude: n(f.centerLatitude), centerLongitude: n(f.centerLongitude), boundaryCoordinates: corners.length >= 3 ? toPolygon(corners) : undefined, soilType: f.soilType || undefined, waterSource: f.waterSource || undefined, irrigationMethod: f.irrigationMethod || undefined, hasIrrigation: f.hasIrrigation,
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
        {pick('Region', 'region', regions, ['district', 'ward'])}
        {pick('District', 'district', districts, ['ward'])}
        {pick('Ward', 'ward', wards, [])}
        <Field label="Village"><input className="input-field" value={f.village} onChange={(e) => set('village', e.target.value)} /></Field>
        <Field label="Centre latitude"><input className="input-field" type="number" value={f.centerLatitude} onChange={(e) => set('centerLatitude', e.target.value)} /></Field>
        <Field label="Centre longitude"><input className="input-field" type="number" value={f.centerLongitude} onChange={(e) => set('centerLongitude', e.target.value)} /></Field>
        <Field label="Soil type"><input className="input-field" value={f.soilType} onChange={(e) => set('soilType', e.target.value)} /></Field>
        <Field label="Water source"><input className="input-field" value={f.waterSource} onChange={(e) => set('waterSource', e.target.value)} /></Field>
        <Field label="Farm manager"><select className="input-field" value={f.managerUserId} onChange={(e) => set('managerUserId', e.target.value)}><option value="">None yet</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></Field>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.hasIrrigation} onChange={(e) => set('hasIrrigation', e.target.checked)} />Has irrigation</label>
      </FormGrid>
      <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>Farm boundary (optional)</h4>
      <p style={{ fontSize: 12, color: 'var(--neutral-500)', margin: '0 0 8px' }}>Zoom to the farm and click each corner in turn. The middle of the shape fills the GPS centre, and its area suggests the size if you have not typed one.</p>
      <Isolated><BoundaryPicker corners={corners} onChange={draw} focus={focus} center={f.centerLatitude && f.centerLongitude ? [Number(f.centerLatitude), Number(f.centerLongitude)] : null} /></Isolated>
    </Modal>
  );
}
