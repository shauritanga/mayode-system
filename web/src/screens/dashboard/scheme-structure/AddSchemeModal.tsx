'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { irrigationApi, locationsApi, mamcosApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Field, FormGrid, errMsg, useApi } from '../irrigation/ui';

const blank = {
  code: '', name: '', mamcosId: '', waterSource: '', region: '', district: '', ward: '', village: '',
  plannedCanalCount: '6', minBlocksPerCanal: '15', maxBlocksPerCanal: '16', hectaresPerBlock: '30', maxHectaresPerFarmer: '1', requireAllocationApproval: false,
};

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 20 }}>
    <div style={{ marginBottom: 10 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>{title}</h3>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{hint}</div>}
    </div>
    {children}
  </section>
);

/** Register a new irrigation scheme without leaving the Scheme Structure page. */
export default function AddSchemeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (scheme: any) => void }) {
  const user = useAuthStore((s) => s.user);
  const platformWide = user?.role === 'SUPER_ADMIN' || !user?.mamcosId;
  const [form, setForm] = useState<any>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cooperatives = useApi<any>(platformWide ? () => mamcosApi.getAll() : null, [platformWide]);
  const regions = useApi<any[]>(() => locationsApi.getRegions(), []);
  const regionId = regions.data?.find((r) => r.name === form.region)?.id;
  const districts = useApi<any[]>(regionId ? () => locationsApi.getDistricts(regionId) : null, [regionId]);
  const districtId = districts.data?.find((d) => d.name === form.district)?.id;
  const wards = useApi<any[]>(districtId ? () => locationsApi.getWards(districtId) : null, [districtId]);
  const set = (k: string, v: any) => { setForm((f: any) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = 'Scheme code is required';
    else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(form.code.trim())) e.code = 'Use letters, digits, ".", "_" or "-"';
    if (!form.name.trim()) e.name = 'Scheme name is required';
    if (platformWide && !form.mamcosId) e.mamcosId = 'Choose the AMCOS';
    if (!form.waterSource.trim()) e.waterSource = 'Water source is required';
    if (!form.region) e.region = 'Region is required';
    if (!form.district) e.district = 'District is required';
    if (Number(form.minBlocksPerCanal) > Number(form.maxBlocksPerCanal)) e.minBlocksPerCanal = 'Cannot exceed the maximum';
    setErrors(e);
    if (Object.keys(e).length) { setError('Please fix the highlighted fields.'); return; }
    setSaving(true); setError('');
    try {
      const body: any = {
        code: form.code.trim(), name: form.name.trim(), region: form.region, district: form.district, ward: form.ward || undefined, village: form.village.trim() || undefined,
        waterSource: form.waterSource.trim(), status: 'ACTIVE', plannedCanalCount: Number(form.plannedCanalCount), minBlocksPerCanal: Number(form.minBlocksPerCanal),
        maxBlocksPerCanal: Number(form.maxBlocksPerCanal), hectaresPerBlock: Number(form.hectaresPerBlock),
        maxHectaresPerFarmer: form.maxHectaresPerFarmer === '' ? null : Number(form.maxHectaresPerFarmer), requireAllocationApproval: form.requireAllocationApproval,
      };
      if (platformWide) body.mamcosId = form.mamcosId;
      const res = await irrigationApi.createScheme(body);
      onSaved(res.data);
    } catch (err) { setError(errMsg(err, 'Could not save the scheme.')); setSaving(false); }
  };

  const num = (k: string, label: string, hint?: string, err?: string) => (
    <Field label={label} hint={hint} error={err}><input type="number" min={1} className="input-field" value={form[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  return (
    <Modal title="Add scheme" subtitle="Register the irrigation scheme. Canals and blocks are added afterwards." onClose={() => !saving && onClose()} width="720px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="add-scheme-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add scheme'}</button></>}>
      <form id="add-scheme-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <Section title="Scheme">
          <FormGrid>
            <Field label="Scheme name *" error={errors.name}><input className="input-field" autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Madibira Irrigation Scheme" /></Field>
            <Field label="Scheme code *" error={errors.code} hint="Short and unique, e.g. MBR-01"><input className="input-field" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
            {platformWide && (
              <Field label="AMCOS *" error={errors.mamcosId}>
                <select className="input-field" value={form.mamcosId} onChange={(e) => set('mamcosId', e.target.value)}>
                  <option value="">Select AMCOS</option>
                  {(Array.isArray(cooperatives.data) ? cooperatives.data : cooperatives.data?.data ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Water source *" error={errors.waterSource}><input className="input-field" value={form.waterSource} onChange={(e) => set('waterSource', e.target.value)} placeholder="e.g. Great Ruaha River" /></Field>
          </FormGrid>
        </Section>
        <Section title="Location">
          <FormGrid>
            <Field label="Region *" error={errors.region}>
              <select className="input-field" value={form.region} onChange={(e) => { set('region', e.target.value); set('district', ''); set('ward', ''); }}>
                <option value="">{regions.loading ? 'Loading…' : 'Select region'}</option>
                {(regions.data ?? []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="District *" error={errors.district}>
              <select className="input-field" value={form.district} onChange={(e) => { set('district', e.target.value); set('ward', ''); }} disabled={!form.region}>
                <option value="">{!form.region ? 'Choose a region first' : districts.loading ? 'Loading…' : 'Select district'}</option>
                {(districts.data ?? []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Ward">
              <select className="input-field" value={form.ward} onChange={(e) => set('ward', e.target.value)} disabled={!form.district}>
                <option value="">{!form.district ? 'Choose a district first' : wards.loading ? 'Loading…' : 'Select ward'}</option>
                {(wards.data ?? []).map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Village"><input className="input-field" value={form.village} onChange={(e) => set('village', e.target.value)} /></Field>
          </FormGrid>
        </Section>
        <Section title="Layout and rules" hint="Used for setup alerts and limits. You can change them later.">
          <FormGrid>
            {num('plannedCanalCount', 'Planned canals')}
            {num('hectaresPerBlock', 'Hectares per block', 'Each hectare becomes one allocation unit')}
            {num('minBlocksPerCanal', 'Minimum blocks per canal', 'Alerts below this', errors.minBlocksPerCanal)}
            {num('maxBlocksPerCanal', 'Maximum blocks per canal', 'More blocks are refused')}
            {num('maxHectaresPerFarmer', 'Hectares allowed per member', 'Leave empty for no limit')}
          </FormGrid>
          <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={form.requireAllocationApproval} onChange={(e) => set('requireAllocationApproval', e.target.checked)} />
            Allocations and transfers need a second person&apos;s approval
          </label>
        </Section>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </form>
    </Modal>
  );
}
