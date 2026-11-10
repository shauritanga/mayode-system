'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { irrigationApi, locationsApi, mamcosApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  BASE, CardsSkeleton, DocumentsPanel, Field, FormGrid, HistoryPanel, LoadError, Notice, PageHeader, Panel, StatusBadge, Tabs,
  errMsg, fmtDate, titleCase, useApi, useIrrigation,
} from './ui';

const STATUSES = ['PLANNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'INACTIVE'];
const blank = {
  code: '', name: '', mamcosId: '', region: '', district: '', ward: '', village: '', waterSource: '', establishedOn: '', description: '',
  status: 'ACTIVE', plannedCanalCount: '6', minBlocksPerCanal: '15', maxBlocksPerCanal: '16', hectaresPerBlock: '30',
  maxHectaresPerFarmer: '', requireAllocationApproval: false, requireRecipientAcceptance: true,
};

function SchemeEditor({ schemeId, existing }: { schemeId?: string; existing: ReturnType<typeof useApi<any>> }) {
  const router = useRouter();
  const { can, reloadSchemes, setSchemeId } = useIrrigation();
  const user = useAuthStore((s) => s.user);
  const isNew = !schemeId;
  const platformWide = user?.role === 'SUPER_ADMIN' || !user?.mamcosId;
  const cooperatives = useApi<any>(isNew && platformWide ? () => mamcosApi.getAll() : null, [isNew, platformWide]);
  const [form, setForm] = useState<any>(() => formFrom(existing.data));
  // Region → District → Ward come from the location registry; the scheme stores the chosen names.
  const regions = useApi<any[]>(() => locationsApi.getRegions(), []);
  const regionId = regions.data?.find((r) => r.name === form.region)?.id;
  const districts = useApi<any[]>(regionId ? () => locationsApi.getDistricts(regionId) : null, [regionId]);
  const districtId = districts.data?.find((d) => d.name === form.district)?.id;
  const wards = useApi<any[]>(districtId ? () => locationsApi.getWards(districtId) : null, [districtId]);
  const options = (list: any[] | null | undefined, current: string) => {
    const names = (list ?? []).map((x) => x.name as string);
    // A value saved earlier that is not in the registry stays selectable instead of silently vanishing.
    return current && !names.includes(current) ? [current, ...names] : names;
  };
  const [tab, setTab] = useState<'details' | 'documents' | 'history'>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const canWrite = can('irrigation', isNew ? 'CREATE' : 'EDIT');

  const set = (key: string, value: any) => { setForm((f: any) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: '' })); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = 'Scheme code is required';
    else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(form.code.trim())) e.code = 'Use letters, digits, ".", "_" or "-"';
    if (!form.name.trim()) e.name = 'Scheme name is required';
    if (isNew && platformWide && !form.mamcosId) e.mamcosId = 'Choose the AMCOS';
    if (!form.region.trim()) e.region = 'Region is required';
    if (!form.district.trim()) e.district = 'District is required';
    if (!form.waterSource.trim()) e.waterSource = 'Water source is required';
    if (Number(form.minBlocksPerCanal) > Number(form.maxBlocksPerCanal)) e.minBlocksPerCanal = 'Cannot exceed the maximum';
    return e;
  };

  const save = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) { setMessage({ tone: 'error', text: 'Please fix the highlighted fields.' }); return; }
    setSaving(true); setMessage(null);
    const body: any = {
      code: form.code.trim(), name: form.name.trim(), region: form.region.trim(), district: form.district.trim(), ward: form.ward.trim(),
      village: form.village.trim(), waterSource: form.waterSource.trim(), description: form.description.trim(), status: form.status,
      plannedCanalCount: Number(form.plannedCanalCount), minBlocksPerCanal: Number(form.minBlocksPerCanal),
      maxBlocksPerCanal: Number(form.maxBlocksPerCanal), hectaresPerBlock: Number(form.hectaresPerBlock),
      maxHectaresPerFarmer: form.maxHectaresPerFarmer === '' ? null : Number(form.maxHectaresPerFarmer),
      requireAllocationApproval: form.requireAllocationApproval,
      requireRecipientAcceptance: form.requireRecipientAcceptance,
    };
    if (form.establishedOn) body.establishedOn = form.establishedOn;
    try {
      if (isNew) {
        if (platformWide) body.mamcosId = form.mamcosId;
        const res = await irrigationApi.createScheme(body);
        reloadSchemes(); setSchemeId(res.data.id);
        router.push(`${BASE}/structure/scheme/${res.data.id}`);
      } else {
        // hectaresPerBlock only affects blocks created from now on; say so rather than silently ignoring it.
        await irrigationApi.updateScheme(schemeId!, body);
        existing.reload(); reloadSchemes();
        setMessage({ tone: 'success', text: 'Scheme saved.' });
      }
    } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'Could not save the scheme.') }); } finally { setSaving(false); }
  };

  const s = existing.data;
  return (
    <>
      <PageHeader title={isNew ? 'Register irrigation scheme' : (s?.name ?? 'Irrigation scheme')}
        subtitle={isNew ? 'One scheme per AMCOS irrigation area. Canals and blocks are added afterwards.' : [s?.code, s?.mamcos?.name].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Scheme Registration' }]}
        actions={s ? <StatusBadge value={s.status} /> : undefined} />
      <LoadError message={existing.error} onRetry={existing.reload} />
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      {!isNew && <Tabs tabs={[{ id: 'details', label: 'Details' }, { id: 'documents', label: 'Documents' }, { id: 'history', label: 'History' }]} active={tab} onChange={setTab} />}
      {!isNew && existing.loading && <CardsSkeleton count={3} />}
      {(isNew || (!existing.loading && s)) && tab === 'details' && (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <Panel title="Identity">
            <FormGrid>
              <Field label="Scheme code *" error={errors.code} hint="Unique across the system, e.g. MBR-01"><input className="input-field" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Scheme name *" error={errors.name}><input className="input-field" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="AMCOS *" error={errors.mamcosId}>
                {isNew && platformWide ? (
                  <select className="input-field" value={form.mamcosId} onChange={(e) => set('mamcosId', e.target.value)}>
                    <option value="">Select AMCOS</option>
                    {(Array.isArray(cooperatives.data) ? cooperatives.data : cooperatives.data?.data ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : <input className="input-field" value={s?.mamcos?.name ?? 'Your AMCOS'} disabled />}
              </Field>
              <Field label="Status"><select className="input-field" value={form.status} onChange={(e) => set('status', e.target.value)} disabled={!canWrite}>{STATUSES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}</select></Field>
              <Field label="Establishment date"><input type="date" className="input-field" value={form.establishedOn} onChange={(e) => set('establishedOn', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Water source *" error={errors.waterSource}><input className="input-field" value={form.waterSource} onChange={(e) => set('waterSource', e.target.value)} disabled={!canWrite} placeholder="e.g. Great Ruaha River" /></Field>
            </FormGrid>
          </Panel>
          <Panel title="Location">
            <FormGrid>
              <Field label="Region *" error={errors.region}>
                <select className="input-field" value={form.region} onChange={(e) => { set('region', e.target.value); set('district', ''); set('ward', ''); }} disabled={!canWrite}>
                  <option value="">{regions.loading ? 'Loading…' : 'Select region'}</option>
                  {options(regions.data, form.region).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="District *" error={errors.district}>
                <select className="input-field" value={form.district} onChange={(e) => { set('district', e.target.value); set('ward', ''); }} disabled={!canWrite || !form.region}>
                  <option value="">{!form.region ? 'Choose a region first' : districts.loading ? 'Loading…' : 'Select district'}</option>
                  {options(districts.data, form.district).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Ward">
                <select className="input-field" value={form.ward} onChange={(e) => set('ward', e.target.value)} disabled={!canWrite || !form.district}>
                  <option value="">{!form.district ? 'Choose a district first' : wards.loading ? 'Loading…' : 'Select ward'}</option>
                  {options(wards.data, form.ward).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Village"><input className="input-field" value={form.village} onChange={(e) => set('village', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Description" wide><textarea className="input-field" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} disabled={!canWrite} /></Field>
            </FormGrid>
          </Panel>
          <Panel title="Layout and allocation policy">
            <FormGrid>
              <Field label="Planned canals" hint="Used for setup alerts"><input type="number" min={1} className="input-field" value={form.plannedCanalCount} onChange={(e) => set('plannedCanalCount', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Minimum blocks per canal" error={errors.minBlocksPerCanal} hint="Alerts below this"><input type="number" min={1} className="input-field" value={form.minBlocksPerCanal} onChange={(e) => set('minBlocksPerCanal', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Maximum blocks per canal" hint="Blocks beyond this are refused"><input type="number" min={1} className="input-field" value={form.maxBlocksPerCanal} onChange={(e) => set('maxBlocksPerCanal', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Hectares per block" hint={isNew ? 'Each hectare becomes one allocation unit' : 'Applies to blocks created from now on'}><input type="number" min={1} className="input-field" value={form.hectaresPerBlock} onChange={(e) => set('hectaresPerBlock', e.target.value)} disabled={!canWrite} /></Field>
              <Field label="Hectares allowed per member" hint="Leave empty for no limit"><input type="number" min={1} className="input-field" value={form.maxHectaresPerFarmer} onChange={(e) => set('maxHectaresPerFarmer', e.target.value)} disabled={!canWrite} /></Field>
              <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.requireAllocationApproval} onChange={(e) => set('requireAllocationApproval', e.target.checked)} disabled={!canWrite} />
                New allocations need a second person&apos;s approval (plot transfers always need Manager or Accountant sign-off)
              </label>
              <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.requireRecipientAcceptance} onChange={(e) => set('requireRecipientAcceptance', e.target.checked)} disabled={!canWrite} />
                Transfers must be accepted by the receiving member (SMS + app) first
              </label>
            </FormGrid>
          </Panel>
          {s && <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Created {fmtDate(s.createdAt)}{s.createdByName ? ` by ${s.createdByName}` : ''} · Last updated {fmtDate(s.updatedAt)}{s.updatedByName ? ` by ${s.updatedByName}` : ''}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            {canWrite && <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Register scheme' : 'Save changes'}</button>}
            <Link className="btn-secondary" href={BASE}>{isNew ? 'Cancel' : 'Back to overview'}</Link>
          </div>
        </form>
      )}
      {!isNew && s && tab === 'documents' && <DocumentsPanel schemeId={s.id} canAdd={can('irrigation', 'CREATE')} />}
      {!isNew && s && tab === 'history' && <HistoryPanel load={() => irrigationApi.schemeHistory(s.id)} deps={[s.id, s.updatedAt]} />}
    </>
  );
}

const formFrom = (s: any) => !s ? blank : ({
  code: s.code ?? '', name: s.name ?? '', mamcosId: s.mamcosId ?? '', region: s.region ?? '', district: s.district ?? '', ward: s.ward ?? '',
  village: s.village ?? '', waterSource: s.waterSource ?? '', establishedOn: s.establishedOn ? String(s.establishedOn).slice(0, 10) : '',
  description: s.description ?? '', status: s.status, plannedCanalCount: String(s.plannedCanalCount), minBlocksPerCanal: String(s.minBlocksPerCanal),
  maxBlocksPerCanal: String(s.maxBlocksPerCanal), hectaresPerBlock: String(s.hectaresPerBlock),
  maxHectaresPerFarmer: s.maxHectaresPerFarmer == null ? '' : String(s.maxHectaresPerFarmer), requireAllocationApproval: !!s.requireAllocationApproval,
  requireRecipientAcceptance: !!s.requireRecipientAcceptance,
});

/** Page 2 — register a scheme, or view / edit an existing one with its change history. */
export default function SchemeForm({ schemeId }: { schemeId?: string }) {
  const existing = useApi<any>(schemeId ? () => irrigationApi.scheme(schemeId) : null, [schemeId]);
  if (schemeId && existing.loading && !existing.data) return <><PageHeader title="Irrigation scheme" /><CardsSkeleton count={3} /></>;
  if (schemeId && !existing.data) return <><PageHeader title="Irrigation scheme" /><LoadError message={existing.error || 'Scheme not found'} onRetry={existing.reload} /></>;
  // Keyed on the saved version so the form re-reads the record after each save.
  return <SchemeEditor key={`${schemeId ?? 'new'}:${existing.data?.updatedAt ?? ''}`} schemeId={schemeId} existing={existing} />;
}
