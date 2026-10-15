'use client';
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { cropCyclesApi, farmingSeasonsApi, farmsApi, riceVarietiesApi } from '@/lib/api';
import { CYCLE_STATUSES, GROWTH_STAGES, IRRIGATION_TYPES, PRODUCTION_METHODS, stageIndex } from '@/lib/crop-stages';

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };
const sectionStyle: React.CSSProperties = { gridColumn: '1 / -1', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' };

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const s = (v: unknown) => (v == null ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

export default function CropCycleEditorModal({
  cycle,
  farmId,
  onClose,
  onSaved,
}: {
  /** Existing crop cycle (with its farm) to edit; omit to start a new one. */
  cycle?: any;
  /** Pre-select the farm when starting a cycle from a farm page. */
  farmId?: string;
  onClose: () => void;
  onSaved: (cycle: any) => void;
}) {
  const editing = !!cycle;
  const [farms, setFarms] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [farmQuery, setFarmQuery] = useState('');
  const [selectedFarmId, setSelectedFarmId] = useState(cycle?.farmId ?? farmId ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [v, setV] = useState({
    farmingSeasonId: s(cycle?.farmingSeasonId),
    season: s(cycle?.season),
    varietyId: s(cycle?.riceVarietyId),
    plantingDate: day(cycle?.plantingDate),
    expectedHarvest: day(cycle?.expectedHarvest),
    harvestDate: day(cycle?.harvestDate),
    areaPlantedHa: s(cycle?.areaPlantedHa),
    seedQuantityKg: s(cycle?.seedQuantityKg),
    productionMethod: s(cycle?.productionMethod),
    irrigationType: s(cycle?.irrigationType),
    growthStage: s(cycle?.growthStage),
    stageNote: '',
    estimatedYieldKg: s(cycle?.estimatedYieldKg),
    actualYieldKg: s(cycle?.actualYieldKg),
    status: s(cycle?.status) || 'PLANNED',
  });
  const set = (key: keyof typeof v, value: string) => setV((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    farmingSeasonsApi.getAll().then((r) => setSeasons(r.data || [])).catch(() => setSeasons([]));
    riceVarietiesApi.list().then((r) => setVarieties(r.data || [])).catch(() => setVarieties([]));
    if (!editing) farmsApi.getAll().then((r) => setFarms(r.data?.data || r.data || [])).catch(() => setFarms([]));
  }, [editing]);

  const farm = useMemo(
    () => (editing ? cycle.farm : farms.find((f) => f.id === selectedFarmId)),
    [editing, cycle, farms, selectedFarmId],
  );
  const farmMatches = useMemo(() => {
    const q = farmQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return farms
      .filter((f) => `${f.farmCode} ${f.name || ''} ${f.farmer?.firstName || ''} ${f.farmer?.lastName || ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [farms, farmQuery]);

  // Sensible defaults once a farm is chosen: whole-farm area and the farm's irrigation.
  const chooseFarm = (f: any) => {
    setSelectedFarmId(f.id);
    setFarmQuery('');
    setV((p) => ({
      ...p,
      areaPlantedHa: p.areaPlantedHa || s(f.socialHectares),
      irrigationType: p.irrigationType || (f.hasIrrigation ? 'CANAL_GRAVITY' : 'RAIN_FED'),
    }));
  };
  useEffect(() => {
    if (!editing && farmId && farms.length && !v.areaPlantedHa) {
      const f = farms.find((x) => x.id === farmId);
      if (f) chooseFarm(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms]);

  const onSeason = (id: string) => {
    const linked = seasons.find((x) => x.id === id);
    setV((p) => ({ ...p, farmingSeasonId: id, season: id ? linked?.name || p.season : p.season }));
  };

  // Expected harvest follows planting date + the variety's days to maturity, unless the user typed one.
  const onPlantingOrVariety = (planting: string, varietyId: string) => {
    const variety = varieties.find((x) => x.id === varietyId);
    setV((p) => {
      const next = { ...p, plantingDate: planting, varietyId };
      if (planting && variety?.maturityDays && !p.expectedHarvest) {
        const d = new Date(planting);
        d.setDate(d.getDate() + variety.maturityDays);
        next.expectedHarvest = d.toISOString().slice(0, 10);
      }
      return next;
    });
  };

  const submit = async () => {
    setError('');
    if (!editing && !selectedFarmId) return setError('Choose the farm for this crop.');
    if (!v.season.trim() && !v.farmingSeasonId) return setError('Enter the season name or choose a farming season.');
    if (!v.varietyId) return setError('Choose the rice variety.');
    const area = num(v.areaPlantedHa);
    if (area == null || Number.isNaN(area) || area <= 0) return setError('Enter the area planted in hectares.');
    if (farm?.socialHectares != null && area > farm.socialHectares) return setError(`Area planted cannot be larger than the farm (${farm.socialHectares} ha).`);
    if (v.plantingDate && v.expectedHarvest && v.expectedHarvest < v.plantingDate) return setError('Expected harvest cannot be earlier than planting.');
    if (v.plantingDate && v.harvestDate && v.harvestDate < v.plantingDate) return setError('Harvest date cannot be earlier than planting.');
    for (const [label, value] of [['Seed quantity', v.seedQuantityKg], ['Expected yield', v.estimatedYieldKg], ['Actual yield', v.actualYieldKg]] as const) {
      const n = num(value);
      if (n != null && (Number.isNaN(n) || n < 0)) return setError(`${label} must be zero or more.`);
    }
    const variety = varieties.find((x) => x.id === v.varietyId);
    const iso = (d: string) => (d ? new Date(d).toISOString() : undefined);
    const body: Record<string, unknown> = {
      season: v.season.trim() || undefined,
      farmingSeasonId: v.farmingSeasonId || undefined,
      riceVarietyId: v.varietyId,
      riceVariety: variety?.name,
      plantingDate: iso(v.plantingDate),
      expectedHarvest: iso(v.expectedHarvest),
      areaPlantedHa: area,
      seedQuantityKg: num(v.seedQuantityKg),
      productionMethod: v.productionMethod || undefined,
      irrigationType: v.irrigationType || undefined,
      growthStage: v.growthStage || undefined,
      estimatedYieldKg: num(v.estimatedYieldKg),
    };
    setSaving(true);
    try {
      let res;
      if (editing) {
        res = await cropCyclesApi.update(cycle.id, {
          ...body,
          harvestDate: iso(v.harvestDate),
          actualYieldKg: num(v.actualYieldKg),
          status: v.status,
          stageNote: v.stageNote.trim() || undefined,
        });
      } else {
        res = await cropCyclesApi.create({ ...body, farmId: selectedFarmId });
      }
      onSaved(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save the crop season.');
    } finally {
      setSaving(false);
    }
  };

  const stageChanged = editing && v.growthStage && v.growthStage !== s(cycle?.growthStage);

  return (
    <Modal
      title={editing ? `Edit ${cycle.season}` : 'Start crop season'}
      subtitle={editing ? `${cycle.farm?.farmCode ?? ''}` : 'Record the rice crop for a farm this season'}
      width="860px"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Start crop season'}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <div style={sectionStyle}>Season &amp; farm</div>
        {!editing && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Farm *</label>
            {selectedFarmId && farm ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-green">{farm.farmCode}{farm.farmer ? ` · ${farm.farmer.firstName} ${farm.farmer.lastName}` : ''} · {farm.socialHectares} ha</span>
                {!farmId && <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSelectedFarmId('')}>Change</button>}
              </div>
            ) : (
              <>
                <input className="input-field" placeholder="Search farm code or farmer name…" value={farmQuery} onChange={(e) => setFarmQuery(e.target.value)} />
                {farmMatches.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 4, border: '1px solid var(--border-subtle)', borderRadius: 10, background: 'var(--surface-1)' }}>
                    {farmMatches.map((f) => (
                      <li key={f.id}>
                        <button type="button" style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-1)', fontSize: 13 }} onClick={() => chooseFarm(f)}>
                          {f.farmCode} · {f.farmer ? `${f.farmer.firstName} ${f.farmer.lastName}` : 'No farmer'} · {f.socialHectares} ha
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <Field label="Farming season">
          <select className="input-field" value={v.farmingSeasonId} onChange={(e) => onSeason(e.target.value)}>
            <option value="">Not linked</option>
            {seasons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Season name *"><input className="input-field" placeholder="2026/2027 Masika" value={v.season} onChange={(e) => set('season', e.target.value)} /></Field>
        <Field label="Rice variety *">
          <select className="input-field" value={v.varietyId} onChange={(e) => onPlantingOrVariety(v.plantingDate, e.target.value)}>
            <option value="">Select variety…</option>
            {varieties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>

        <div style={sectionStyle}>Dates</div>
        <Field label="Planting date"><input className="input-field" type="date" value={v.plantingDate} onChange={(e) => onPlantingOrVariety(e.target.value, v.varietyId)} /></Field>
        <Field label="Expected harvest date"><input className="input-field" type="date" value={v.expectedHarvest} onChange={(e) => set('expectedHarvest', e.target.value)} /></Field>
        {editing && <Field label="Actual harvest date"><input className="input-field" type="date" value={v.harvestDate} onChange={(e) => set('harvestDate', e.target.value)} /></Field>}

        <div style={sectionStyle}>Planting details</div>
        <Field label={`Area planted (ha) *${farm?.socialHectares ? ` — farm is ${farm.socialHectares} ha` : ''}`}>
          <input className="input-field" type="number" min="0.01" step="0.01" value={v.areaPlantedHa} onChange={(e) => set('areaPlantedHa', e.target.value)} />
        </Field>
        <Field label="Seed quantity (kg)"><input className="input-field" type="number" min="0" step="0.1" value={v.seedQuantityKg} onChange={(e) => set('seedQuantityKg', e.target.value)} /></Field>
        <Field label="Production method">
          <select className="input-field" value={v.productionMethod} onChange={(e) => set('productionMethod', e.target.value)}>
            <option value="">Select…</option>
            {Object.entries(PRODUCTION_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
        <Field label="Irrigation type">
          <select className="input-field" value={v.irrigationType} onChange={(e) => set('irrigationType', e.target.value)}>
            <option value="">Select…</option>
            {Object.entries(IRRIGATION_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>

        <div style={sectionStyle}>Crop progress</div>
        <Field label="Growth stage">
          <select className="input-field" value={v.growthStage} onChange={(e) => set('growthStage', e.target.value)}>
            <option value="">Not recorded</option>
            {GROWTH_STAGES.map((st, i) => <option key={st.key} value={st.key}>{i + 1}. {st.label}</option>)}
            {cycle?.growthStage && stageIndex(cycle.growthStage) >= 0 && !GROWTH_STAGES.some((g) => g.key === cycle.growthStage) && (
              <option value={cycle.growthStage}>{String(cycle.growthStage).replace(/_/g, ' ').toLowerCase()} (legacy)</option>
            )}
          </select>
        </Field>
        {stageChanged && <Field label="Stage note"><input className="input-field" placeholder="Optional — kept in the timeline" value={v.stageNote} onChange={(e) => set('stageNote', e.target.value)} /></Field>}
        {editing && (
          <Field label="Crop status">
            <select className="input-field" value={v.status} onChange={(e) => set('status', e.target.value)}>
              {CYCLE_STATUSES.map((st) => <option key={st} value={st}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
        )}

        <div style={sectionStyle}>Yield</div>
        <Field label="Expected yield (kg)"><input className="input-field" type="number" min="0" step="1" value={v.estimatedYieldKg} onChange={(e) => set('estimatedYieldKg', e.target.value)} /></Field>
        {editing && <Field label="Actual yield (kg)"><input className="input-field" type="number" min="0" step="1" value={v.actualYieldKg} onChange={(e) => set('actualYieldKg', e.target.value)} /></Field>}
      </div>
      {error && <div style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 12 }}>{error}</div>}
    </Modal>
  );
}
