'use client';
import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { cropCyclesApi, mamcosApi, plotsApi, uploadsApi } from '@/lib/api';
import { ACTIVITY_TYPES, INPUT_UNITS } from '@/lib/activity-types';

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };
const s = (v: unknown) => (v == null ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div style={wide ? { gridColumn: '1 / -1' } : undefined}><label style={labelStyle}>{label}</label>{children}</div>;
}

const cycleLabel = (c: any) =>
  `${c.farmer ? `${c.farmer.firstName} ${c.farmer.lastName} · ` : ''}${c.farm?.farmCode ?? ''} · ${c.season}`;

export default function ActivityEditorModal({
  activity,
  cropCycleId,
  onClose,
  onSaved,
}: {
  /** Existing activity to edit; omit to record a new one. */
  activity?: any;
  /** Pre-select the crop season when recording from a crop page. */
  cropCycleId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!activity;
  const fileRef = useRef<HTMLInputElement>(null);
  const [cycles, setCycles] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>(activity?.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [v, setV] = useState({
    cropCycleId: activity?.cropCycleId ?? cropCycleId ?? '',
    activityType: activity?.activityType ?? 'LAND_PREPARATION',
    activityDate: (activity?.activityDate ?? new Date().toISOString()).slice(0, 10),
    plotId: s(activity?.plotId),
    fieldOfficerId: s(activity?.fieldOfficerId),
    inputName: s(activity?.inputName),
    inputQuantity: s(activity?.inputQuantity),
    inputUnit: s(activity?.inputUnit) || 'kg',
    cost: s(activity?.cost),
    description: s(activity?.description),
    remarks: s(activity?.remarks),
  });
  const set = (k: keyof typeof v, value: string) => setV((p) => ({ ...p, [k]: value }));

  useEffect(() => {
    if (!editing) cropCyclesApi.getAll().then((r) => setCycles(r.data?.data || r.data || [])).catch(() => setCycles([]));
    mamcosApi.fieldOfficers().then((r) => setOfficers(r.data || [])).catch(() => setOfficers([]));
  }, [editing]);

  const farmId = editing ? activity.cropCycle?.farmId : cycles.find((c) => c.id === v.cropCycleId)?.farmId;
  useEffect(() => {
    if (!farmId) { setPlots([]); return; }
    plotsApi.byFarm(farmId).then((r) => setPlots(r.data?.data || r.data || [])).catch(() => setPlots([]));
  }, [farmId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) urls.push((await uploadsApi.upload(file)).data.url);
      setPhotos((p) => [...p, ...urls]);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not upload the photo.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!v.cropCycleId) return setError('Choose the crop season this work belongs to.');
    if (!v.activityDate) return setError('Enter the activity date.');
    const payload: Record<string, unknown> = {
      activityType: v.activityType,
      activityDate: new Date(v.activityDate).toISOString(),
      plotId: v.plotId || null,
      fieldOfficerId: v.fieldOfficerId || undefined,
      inputName: v.inputName.trim() || undefined,
      inputQuantity: num(v.inputQuantity),
      inputUnit: v.inputName.trim() || v.inputQuantity ? v.inputUnit : undefined,
      cost: num(v.cost),
      description: v.description.trim() || undefined,
      remarks: v.remarks.trim() || undefined,
      photoUrls: photos,
    };
    setSaving(true);
    setError('');
    try {
      if (editing) await cropCyclesApi.updateActivityLog(activity.id, payload);
      else await cropCyclesApi.logActivity({ ...payload, cropCycleId: v.cropCycleId });
      onSaved();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Could not save the activity.');
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit activity' : 'Record activity'}
      subtitle="Work done on a rice farm during the season."
      onClose={onClose}
      width="680px"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Record activity'}</button>
        </>
      }
    >
      {error && <div className="alert-box alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Crop season (farmer · farm)" wide>
          {editing ? (
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{cycleLabel(activity.cropCycle)}</div>
          ) : (
            <select className="input-field" value={v.cropCycleId} onChange={(e) => { set('cropCycleId', e.target.value); set('plotId', ''); }}>
              <option value="">Select a crop season…</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
            </select>
          )}
        </Field>
        <Field label="Activity type">
          <select className="input-field" value={v.activityType} onChange={(e) => set('activityType', e.target.value)}>
            {ACTIVITY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Activity date">
          <input className="input-field" type="date" value={v.activityDate} onChange={(e) => set('activityDate', e.target.value)} />
        </Field>
        <Field label="Plot">
          <select className="input-field" value={v.plotId} onChange={(e) => set('plotId', e.target.value)} disabled={!farmId}>
            <option value="">Whole farm</option>
            {plots.map((p) => <option key={p.id} value={p.id}>{p.plotCode}{p.name ? ` · ${p.name}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Field officer">
          <select className="input-field" value={v.fieldOfficerId} onChange={(e) => set('fieldOfficerId', e.target.value)}>
            <option value="">{editing ? 'No change / none' : 'Me / none'}</option>
            {officers.map((o) => <option key={o.id} value={o.id}>{o.firstName} {o.lastName}{o.employeeCode ? ` (${o.employeeCode})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Input used (seed, fertilizer, chemical…)">
          <input className="input-field" value={v.inputName} onChange={(e) => set('inputName', e.target.value)} placeholder="e.g. NPK 20:10:10" />
        </Field>
        <Field label="Quantity">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input-field" type="number" min="0" step="any" value={v.inputQuantity} onChange={(e) => set('inputQuantity', e.target.value)} />
            <select className="input-field" style={{ width: 110 }} value={v.inputUnit} onChange={(e) => set('inputUnit', e.target.value)}>
              {INPUT_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Cost (TZS)">
          <input className="input-field" type="number" min="0" step="any" value={v.cost} onChange={(e) => set('cost', e.target.value)} />
        </Field>
        <Field label="What was done" wide>
          <input className="input-field" value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="Short description of the work" />
        </Field>
        <Field label="Remarks" wide>
          <textarea className="input-field" rows={3} value={v.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
        <Field label={`Photos (${photos.length})`} wide>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {photos.map((url) => (
              <div key={url} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Activity" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--neutral-200)' }} />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((u) => u !== url))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 0, background: 'var(--red-500)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px' }}>×</button>
              </div>
            ))}
            <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : '+ Add photos'}</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
