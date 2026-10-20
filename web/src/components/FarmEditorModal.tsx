'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { farmersApi, farmsApi, locationsApi } from '@/lib/api';
import { ACRES_PER_HECTARE, OWNERSHIP_LABELS } from '@/lib/farm-format';

const WATER_SOURCES = ['Irrigation canal', 'River', 'Borehole', 'Well', 'Dam / reservoir', 'Rainfall only', 'Other'];
const IRRIGATION_METHODS = ['Gravity-fed flooding', 'Furrow', 'Sprinkler', 'Drip', 'Pump from river', 'None'];
const SOIL_TYPES = ['Clay', 'Clay loam', 'Loam', 'Sandy loam', 'Sandy clay', 'Sandy', 'Silt'];
const FERTILITY = ['High', 'Medium', 'Low'];
const GRADES = ['A', 'B', 'C'];

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };
const sectionStyle: React.CSSProperties = { gridColumn: '1 / -1', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' };

type Option = { id?: string; name: string };

interface FarmValues {
  farmerId: string; name: string; canal: string; plotNumber: string; blockNumber: string; section: string;
  region: string; district: string; ward: string; village: string; subVillage: string;
  centerLatitude: string; centerLongitude: string; socialHectares: string; actualAcres: string;
  ownershipType: string; landTenure: string; ownerName: string; ownerPhone: string;
  production: 'irrigated' | 'rain-fed'; irrigationMethod: string; waterSource: string;
  soilType: string; soilFertility: string; soilCondition: string; grade: string;
  previousCrops: string; accessibility: string;
}

const EMPTY: FarmValues = {
  farmerId: '', name: '', canal: '', plotNumber: '', blockNumber: '', section: '',
  region: 'Mbeya', district: 'Mbarali', ward: '', village: '', subVillage: '',
  centerLatitude: '', centerLongitude: '', socialHectares: '', actualAcres: '',
  ownershipType: 'OWNED', landTenure: '', ownerName: '', ownerPhone: '',
  production: 'rain-fed', irrigationMethod: '', waterSource: '',
  soilType: '', soilFertility: '', soilCondition: '', grade: 'B',
  previousCrops: '', accessibility: '',
};

function fromFarm(farm: any): FarmValues {
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    ...EMPTY,
    farmerId: s(farm.farmerId), name: s(farm.name), canal: s(farm.canal), plotNumber: s(farm.plotNumber), blockNumber: s(farm.blockNumber), section: s(farm.section),
    region: s(farm.region), district: s(farm.district), ward: s(farm.ward), village: s(farm.village), subVillage: s(farm.subVillage),
    centerLatitude: s(farm.centerLatitude), centerLongitude: s(farm.centerLongitude),
    socialHectares: s(farm.socialHectares), actualAcres: s(farm.actualAcres),
    ownershipType: s(farm.ownershipType) || 'OWNED', landTenure: s(farm.landTenure), ownerName: s(farm.ownerName), ownerPhone: s(farm.ownerPhone),
    production: farm.hasIrrigation ? 'irrigated' : 'rain-fed', irrigationMethod: s(farm.irrigationMethod), waterSource: s(farm.waterSource),
    soilType: s(farm.soilType), soilFertility: s(farm.soilFertility), soilCondition: s(farm.soilCondition), grade: s(farm.grade) || 'B',
    previousCrops: (farm.previousCrops || []).join(', '), accessibility: s(farm.accessibility),
  };
}

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const opt = (v: string) => (v.trim() === '' ? undefined : v.trim());

function Text({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input-field" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

/** Select that also keeps a legacy value that isn't in the list, so editing never silently drops it. */
function Select({ label, value, onChange, options, blank = 'Select…' }: { label: string; value: string; onChange: (v: string) => void; options: Option[] | string[]; blank?: string }) {
  const names = (options as (Option | string)[]).map((o) => (typeof o === 'string' ? o : o.name));
  const all = value && !names.includes(value) ? [value, ...names] : names;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blank}</option>
        {all.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

export default function FarmEditorModal({ farm, onClose, onSaved }: { farm?: any; onClose: () => void; onSaved: (farm: any) => void }) {
  const editing = !!farm;
  const [v, setV] = useState<FarmValues>(() => (farm ? fromFarm(farm) : EMPTY));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [wards, setWards] = useState<Option[]>([]);

  const [farmerQuery, setFarmerQuery] = useState('');
  const [farmerResults, setFarmerResults] = useState<any[]>([]);
  const [farmerLabel, setFarmerLabel] = useState(farm?.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName} · ${farm.farmer.controlNumber}` : '');
  const [farmerMamcosId, setFarmerMamcosId] = useState<string | undefined>(undefined);

  const set = <K extends keyof FarmValues>(key: K, value: FarmValues[K]) => setV((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    locationsApi.getRegions().then((r) => setRegions(r.data || [])).catch(() => setRegions([]));
  }, []);
  useEffect(() => {
    const region = regions.find((r) => r.name === v.region);
    if (!region?.id) { setDistricts([]); return; }
    locationsApi.getDistricts(region.id).then((r) => setDistricts(r.data || [])).catch(() => setDistricts([]));
  }, [regions, v.region]);
  useEffect(() => {
    const district = districts.find((d) => d.name === v.district);
    if (!district?.id) { setWards([]); return; }
    locationsApi.getWards(district.id).then((r) => setWards(r.data || [])).catch(() => setWards([]));
  }, [districts, v.district]);

  useEffect(() => {
    if (editing || farmerQuery.trim().length < 2) { setFarmerResults([]); return; }
    const timer = setTimeout(() => {
      farmersApi.getAll({ search: farmerQuery.trim(), pageSize: 8 })
        .then((res) => setFarmerResults(res.data?.data ?? []))
        .catch(() => setFarmerResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [farmerQuery, editing]);

  const submit = async () => {
    setError('');
    if (!editing && !v.farmerId) return setError('Choose the farmer who owns this farm.');
    if (!v.name.trim()) return setError('Farm name is required.');
    const hectares = num(v.socialHectares);
    if (hectares == null || Number.isNaN(hectares) || hectares < 0.1) return setError('Farm size must be at least 0.1 hectares.');
    const lat = num(v.centerLatitude);
    const lng = num(v.centerLongitude);
    if ((lat == null) !== (lng == null)) return setError('Enter both latitude and longitude, or leave both blank.');
    if (lat != null && (lat < -90 || lat > 90)) return setError('Latitude must be between -90 and 90.');
    if (lng != null && (lng < -180 || lng > 180)) return setError('Longitude must be between -180 and 180.');
    const leased = v.ownershipType === 'RENTED' || v.ownershipType === 'LEASED';
    if (leased && (!v.ownerName.trim() || !v.ownerPhone.trim())) return setError('Owner name and phone are required for rented or leased land.');

    const payload: Record<string, unknown> = {
      name: v.name.trim(), canal: opt(v.canal), plotNumber: opt(v.plotNumber), blockNumber: opt(v.blockNumber), section: opt(v.section),
      region: opt(v.region), district: opt(v.district), ward: opt(v.ward), village: opt(v.village), subVillage: opt(v.subVillage),
      centerLatitude: lat, centerLongitude: lng,
      socialHectares: hectares, actualAcres: num(v.actualAcres),
      ownershipType: v.ownershipType, landTenure: opt(v.landTenure), ownerName: opt(v.ownerName), ownerPhone: opt(v.ownerPhone),
      irrigationStatus: v.production === 'irrigated', irrigationMethod: opt(v.irrigationMethod), waterSource: opt(v.waterSource),
      soilType: opt(v.soilType), soilFertility: opt(v.soilFertility), soilCondition: opt(v.soilCondition), grade: v.grade,
      previousCrops: v.previousCrops.split(',').map((c) => c.trim()).filter(Boolean),
      accessibility: opt(v.accessibility),
    };
    setSaving(true);
    try {
      const res = editing
        ? await farmsApi.update(farm.id, payload)
        : await farmsApi.create({ ...payload, farmerId: v.farmerId, mamcosId: farmerMamcosId });
      onSaved(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save the farm.');
    } finally {
      setSaving(false);
    }
  };

  const hectaresFromAcres = v.actualAcres && !Number.isNaN(Number(v.actualAcres)) ? (Number(v.actualAcres) / ACRES_PER_HECTARE).toFixed(2) : null;

  return (
    <Modal
      title={editing ? `Edit ${farm.farmCode}` : 'Register farm'}
      subtitle={editing ? 'Update farm details' : 'Capture the farm, its location, tenure and water details'}
      width="860px"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Register farm'}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <div style={sectionStyle}>Farm &amp; farmer</div>
        {!editing && (
          <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
            <label style={labelStyle}>Farmer *</label>
            {v.farmerId ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge badge-green">{farmerLabel}</span>
                <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { set('farmerId', ''); setFarmerLabel(''); }}>Change</button>
              </div>
            ) : (
              <>
                <input className="input-field" placeholder="Search farmer by name, control number or phone…" value={farmerQuery} onChange={(e) => setFarmerQuery(e.target.value)} />
                {farmerResults.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 4, border: '1px solid var(--border-subtle)', borderRadius: 10, background: 'var(--surface-1)' }}>
                    {farmerResults.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-1)', fontSize: 13 }}
                          onClick={() => {
                            set('farmerId', f.id);
                            setFarmerLabel(`${f.firstName} ${f.lastName} · ${f.controlNumber}`);
                            setFarmerMamcosId(f.mamcosId || undefined);
                            if (f.region) set('region', f.region);
                            if (f.district) set('district', f.district);
                            if (f.ward) set('ward', f.ward);
                            if (f.village) set('village', f.village);
                            setFarmerResults([]);
                          }}
                        >
                          {f.firstName} {f.lastName} · {f.controlNumber}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <Text label="Farm name *" value={v.name} onChange={(x) => set('name', x)} />
        <Text label="Canal" value={v.canal} onChange={(x) => set('canal', x)} />
        <Text label="Block" value={v.blockNumber} onChange={(x) => set('blockNumber', x)} />
        <Text label="Plot number" value={v.plotNumber} onChange={(x) => set('plotNumber', x)} />
        <Text label="Section" value={v.section} onChange={(x) => set('section', x)} />
        <Select label="Grade" value={v.grade} onChange={(x) => set('grade', x)} options={GRADES} />

        <div style={sectionStyle}>Location</div>
        {regions.length ? <Select label="Region" value={v.region} onChange={(x) => setV((p) => ({ ...p, region: x, district: '', ward: '' }))} options={regions} /> : <Text label="Region" value={v.region} onChange={(x) => set('region', x)} />}
        {districts.length ? <Select label="District" value={v.district} onChange={(x) => setV((p) => ({ ...p, district: x, ward: '' }))} options={districts} /> : <Text label="District" value={v.district} onChange={(x) => set('district', x)} />}
        {wards.length ? <Select label="Ward" value={v.ward} onChange={(x) => set('ward', x)} options={wards} /> : <Text label="Ward" value={v.ward} onChange={(x) => set('ward', x)} />}
        <Text label="Village" value={v.village} onChange={(x) => set('village', x)} />
        <Text label="Sub-village (kitongoji)" value={v.subVillage} onChange={(x) => set('subVillage', x)} />
        <Text label="GPS latitude" type="number" step="any" placeholder="-8.89250" value={v.centerLatitude} onChange={(x) => set('centerLatitude', x)} />
        <Text label="GPS longitude" type="number" step="any" placeholder="34.50350" value={v.centerLongitude} onChange={(x) => set('centerLongitude', x)} />

        <div style={sectionStyle}>Size</div>
        <Text label="Farm size (hectares) *" type="number" min="0.1" step="0.1" value={v.socialHectares} onChange={(x) => set('socialHectares', x)} />
        <div>
          <Text label="Measured size (acres)" type="number" min="0" step="0.01" value={v.actualAcres} onChange={(x) => set('actualAcres', x)} />
          {hectaresFromAcres && <small style={{ color: 'var(--text-3)' }}>≈ {hectaresFromAcres} ha</small>}
        </div>

        <div style={sectionStyle}>Ownership &amp; tenure</div>
        <div>
          <label style={labelStyle}>Land ownership</label>
          <select className="input-field" value={v.ownershipType} onChange={(e) => set('ownershipType', e.target.value)}>
            {Object.entries(OWNERSHIP_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <Text label="Land tenure (title / right of occupancy)" value={v.landTenure} onChange={(x) => set('landTenure', x)} placeholder="Customary right of occupancy" />
        {(v.ownershipType === 'RENTED' || v.ownershipType === 'LEASED') && (
          <>
            <Text label="Landowner name *" value={v.ownerName} onChange={(x) => set('ownerName', x)} />
            <Text label="Landowner phone *" value={v.ownerPhone} onChange={(x) => set('ownerPhone', x)} />
          </>
        )}

        <div style={sectionStyle}>Water &amp; production system</div>
        <div>
          <label style={labelStyle}>Production system</label>
          <select className="input-field" value={v.production} onChange={(e) => set('production', e.target.value as FarmValues['production'])}>
            <option value="irrigated">Irrigated</option>
            <option value="rain-fed">Rain-fed</option>
          </select>
        </div>
        <Select label="Water source" value={v.waterSource} onChange={(x) => set('waterSource', x)} options={WATER_SOURCES} />
        <Select label="Irrigation method" value={v.irrigationMethod} onChange={(x) => set('irrigationMethod', x)} options={IRRIGATION_METHODS} />

        <div style={sectionStyle}>Soil</div>
        <Select label="Soil type" value={v.soilType} onChange={(x) => set('soilType', x)} options={SOIL_TYPES} />
        <Select label="Soil fertility" value={v.soilFertility} onChange={(x) => set('soilFertility', x)} options={FERTILITY} />
        <Text label="Soil condition notes" value={v.soilCondition} onChange={(x) => set('soilCondition', x)} />
        <Text label="Previous crops (comma-separated)" value={v.previousCrops} onChange={(x) => set('previousCrops', x)} placeholder="Rice, Maize" />
        <Text label="Accessibility" value={v.accessibility} onChange={(x) => set('accessibility', x)} />
      </div>
      {error && <div style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 12 }}>{error}</div>}
    </Modal>
  );
}
