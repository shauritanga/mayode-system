'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { irrigationApi, machineryApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, FormGrid, LoadError, Notice, PageHeader, Pager, StatCard, StatusBadge, TableSkeleton, Tabs,
  errMsg, fmtDate, fmtNum, titleCase, todayISO, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';

const ACTIVITY_TYPES = ['PLOUGHING', 'HARROWING', 'LEVELLING', 'TRANSPLANTING', 'SPRAYING', 'HARVESTING', 'THRESHING', 'TRANSPORT', 'OTHER'];
const EQUIPMENT_TYPES = ['TRACTOR', 'POWER_TILLER', 'COMBINE_HARVESTER', 'THRESHER', 'TRANSPLANTER', 'SPRAYER', 'TRUCK', 'OTHER'];
const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const FEE_LABEL: Record<string, string> = { NOT_APPLICABLE: 'No fee', PENDING: 'Due', PAID: 'Paid' };
const FEE_TONE: Record<string, string> = { NOT_APPLICABLE: 'badge-gray', PENDING: 'badge-gold', PAID: 'badge-green' };

function ActivityModal({ activity, equipment, blocks, onClose, onSaved }: { activity?: any; equipment: any[]; blocks: any[]; onClose: () => void; onSaved: (m: string) => void }) {
  const editing = !!activity;
  const [form, setForm] = useState({
    activityDate: activity ? String(activity.activityDate).slice(0, 10) : todayISO(), type: activity?.type ?? 'PLOUGHING',
    equipmentId: activity?.equipment?.id ?? '', operatorName: activity?.operatorName ?? '', blockId: activity?.block?.id ?? '',
    location: activity?.location ?? '', hectares: activity ? String(activity.hectares) : '', feeAmount: '',
    status: activity?.status ?? 'COMPLETED', notes: activity?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const machine = equipment.find((e) => e.id === form.equipmentId);
  const external = machine?.ownership === 'EXTERNAL';
  const suggested = external && Number(form.hectares) > 0 ? Math.round(Number(form.hectares) * Number(machine.feePerHectare ?? 0) * 100) / 100 : 0;
  const paid = activity?.feeStatus === 'PAID';

  const save = async () => {
    const found: Record<string, string> = {};
    if (!form.activityDate) found.activityDate = 'Choose the date';
    if (!form.equipmentId) found.equipmentId = 'Choose the machine';
    if (!(Number(form.hectares) > 0)) found.hectares = 'Enter the hectares worked';
    if (form.status === 'COMPLETED' && form.activityDate > todayISO()) found.activityDate = 'A completed job cannot be in the future';
    if (form.feeAmount !== '' && !(Number(form.feeAmount) >= 0)) found.feeAmount = 'Enter zero or more';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    const body: any = {
      activityDate: form.activityDate, type: form.type, equipmentId: form.equipmentId, operatorName: form.operatorName.trim() || undefined,
      blockId: form.blockId || (editing ? null : undefined), location: form.location.trim() || undefined, hectares: Number(form.hectares),
      status: form.status, notes: form.notes.trim() || undefined,
    };
    if (external && form.feeAmount !== '') body.feeAmount = Number(form.feeAmount);
    try {
      if (editing) await machineryApi.updateActivity(activity.id, body); else await machineryApi.createActivity(body);
      onSaved(editing ? 'Job updated.' : 'Job recorded.');
    } catch (e) { setError(errMsg(e, 'Could not save this job.')); setSaving(false); }
  };

  return (
    <Modal title={editing ? 'Edit job' : 'Record a job'} subtitle="What a machine did, where, and over how many hectares." onClose={() => !saving && onClose()} width="640px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="job-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save job' : 'Record job'}</button></>}>
      <form id="job-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Date *" error={errors.activityDate}><input type="date" className="input-field" value={form.activityDate} onChange={(e) => set('activityDate', e.target.value)} /></Field>
          <Field label="Activity *"><select className="input-field" value={form.type} onChange={(e) => set('type', e.target.value)}>{ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
          <Field label="Machine *" error={errors.equipmentId} wide>
            <select className="input-field" value={form.equipmentId} onChange={(e) => set('equipmentId', e.target.value)} disabled={paid}>
              <option value="">{equipment.length ? 'Select machine' : 'Register a machine first (Equipment tab)'}</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.ownership === 'AMCOS' ? 'AMCOS' : `External (${e.ownerName})`}</option>)}
            </select>
          </Field>
          <Field label="Hectares worked *" error={errors.hectares}><input type="number" min="0.01" step="0.01" className="input-field" value={form.hectares} onChange={(e) => set('hectares', e.target.value)} disabled={paid} /></Field>
          <Field label="Operator"><input className="input-field" value={form.operatorName} onChange={(e) => set('operatorName', e.target.value)} /></Field>
          {blocks.length > 0 && (
            <Field label="Scheme block"><select className="input-field" value={form.blockId} onChange={(e) => set('blockId', e.target.value)}><option value="">Not in a scheme block</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
          )}
          <Field label="Location / farm" hint="For work outside the scheme"><input className="input-field" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Status"><select className="input-field" value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
          {external && !paid && (
            <Field label="Fee to the AMCOS (TZS)" error={errors.feeAmount} hint={suggested ? `Standard: ${tzs(suggested)} (${form.hectares} ha × ${tzs(machine.feePerHectare)})` : 'Leave empty to use hectares × the machine rate'}>
              <input type="number" min="0" className="input-field" value={form.feeAmount} onChange={(e) => set('feeAmount', e.target.value)} placeholder={suggested ? String(suggested) : ''} />
            </Field>
          )}
          {machine && !external && <div className="muted" style={{ fontSize: 12, alignSelf: 'end' }}>An AMCOS-owned machine earns no fee.</div>}
          <Field label="Notes" wide><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </FormGrid>
        {paid && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>The fee is already paid, so the machine, hectares and fee are locked.</p>}
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function EquipmentModal({ item, onClose, onSaved }: { item?: any; onClose: () => void; onSaved: (m: string) => void }) {
  const editing = !!item;
  const [form, setForm] = useState({
    name: item?.name ?? '', type: item?.type ?? 'TRACTOR', registrationNo: item?.registrationNo ?? '', ownership: item?.ownership ?? 'AMCOS',
    ownerName: item?.ownerName ?? '', ownerPhone: item?.ownerPhone ?? '', feePerHectare: item?.feePerHectare == null ? '' : String(item.feePerHectare),
    isActive: item?.isActive ?? true, notes: item?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const external = form.ownership === 'EXTERNAL';

  const save = async () => {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = 'Give the machine a name';
    if (external && !form.ownerName.trim()) found.ownerName = 'Who owns this machine?';
    if (form.feePerHectare !== '' && !(Number(form.feePerHectare) >= 0)) found.feePerHectare = 'Enter zero or more';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    try {
      if (editing) {
        await machineryApi.updateEquipment(item.id, {
          name: form.name.trim(), type: form.type, registrationNo: form.registrationNo.trim(), isActive: form.isActive, notes: form.notes.trim(),
          ...(external ? { ownerName: form.ownerName.trim(), ownerPhone: form.ownerPhone.trim(), ...(form.feePerHectare !== '' ? { feePerHectare: Number(form.feePerHectare) } : {}) } : {}),
        });
      } else {
        await machineryApi.createEquipment({
          name: form.name.trim(), type: form.type, ownership: form.ownership, registrationNo: form.registrationNo.trim() || undefined, notes: form.notes.trim() || undefined,
          ...(external ? { ownerName: form.ownerName.trim(), ownerPhone: form.ownerPhone.trim() || undefined, feePerHectare: form.feePerHectare === '' ? undefined : Number(form.feePerHectare) } : {}),
        });
      }
      onSaved(editing ? 'Machine updated.' : 'Machine registered.');
    } catch (e) { setError(errMsg(e, 'Could not save this machine.')); setSaving(false); }
  };

  return (
    <Modal title={editing ? `Edit ${item.name}` : 'Register a machine'} onClose={() => !saving && onClose()} width="600px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="equipment-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save machine' : 'Register machine'}</button></>}>
      <form id="equipment-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Name *" error={errors.name}><input className="input-field" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tractor MF-385" /></Field>
          <Field label="Type"><select className="input-field" value={form.type} onChange={(e) => set('type', e.target.value)}>{EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
          <Field label="Registration / serial no."><input className="input-field" value={form.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} /></Field>
          <Field label="Owned by" hint={editing ? 'Cannot be changed after the machine has been used' : undefined}>
            <select className="input-field" value={form.ownership} onChange={(e) => set('ownership', e.target.value)} disabled={editing}>
              <option value="AMCOS">The AMCOS</option><option value="EXTERNAL">Someone else, registered with the AMCOS</option>
            </select>
          </Field>
          {external && <>
            <Field label="Owner *" error={errors.ownerName}><input className="input-field" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
            <Field label="Owner phone"><input className="input-field" inputMode="tel" value={form.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} /></Field>
            <Field label="Fee to the AMCOS per hectare (TZS)" error={errors.feePerHectare} hint="Default for each job; you can adjust it per job"><input type="number" min="0" className="input-field" value={form.feePerHectare} onChange={(e) => set('feePerHectare', e.target.value)} /></Field>
          </>}
          {editing && <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />In service (can be used for new jobs)</label>}
          <Field label="Notes" wide><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </FormGrid>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function FeePaidModal({ activity, onClose, onSaved }: { activity: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try { await machineryApi.feePaid(activity.id, date); onSaved('Fee recorded as paid.'); } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Record fee payment" onClose={() => !saving && onClose()} width="440px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</button></>}>
      <p style={{ fontSize: 14, marginTop: 0 }}>{activity.equipment.name} paid <strong>{tzs(activity.feeAmount)}</strong> to the AMCOS for {titleCase(activity.type).toLowerCase()} on {fmtDate(activity.activityDate)} ({fmtNum(activity.hectares, 2)} ha).</p>
      <Field label="Date paid"><input type="date" className="input-field" min={String(activity.activityDate).slice(0, 10)} max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <p className="muted" style={{ fontSize: 12 }}>Once paid, the machine, hectares and fee for this job are locked.</p>
      {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
    </Modal>
  );
}

function Activities({ equipment, blocks, canWrite }: { equipment: any[]; blocks: any[]; canWrite: boolean }) {
  const [filters, setFilters] = useState({ from: '', to: '', type: '', equipmentId: '', ownership: '', status: '', feeStatus: '', q: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ activity?: any } | null>(null);
  const [paying, setPaying] = useState<any>(null);
  const [cancelling, setCancelling] = useState<any>(null);
  const [message, setMessage] = useState('');
  const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 15 };
  const { data, loading, error, reload } = useApi<any>(() => machineryApi.activities(params), [JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const s = data?.summary;
  const filtered = Object.values(filters).some(Boolean);
  const activeEquipment = equipment.filter((e) => e.isActive);

  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div className="metric-grid" style={{ marginBottom: 12 }}>
        <StatCard label="Completed jobs" value={s ? fmtNum(s.jobs) : '—'} hint={filtered ? 'For the filters below' : 'All time'} />
        <StatCard label="Hectares covered" value={s ? fmtNum(s.hectares, 1) : '—'} />
        <StatCard label="Fees collected" value={s ? tzs(s.feesPaid) : '—'} tone="good" />
        <StatCard label="Fees still due" value={s ? tzs(s.feesDue) : '—'} tone={s?.feesDue ? 'warn' : undefined} />
      </div>
      {s?.byType?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {s.byType.map((t: any) => <span key={t.type} className="badge badge-blue">{titleCase(t.type)} · {fmtNum(t.hectares, 1)} ha · {t.jobs} job{t.jobs === 1 ? '' : 's'}</span>)}
        </div>
      )}

      <section className="table-panel">
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Machine, operator, block" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="From"><input type="date" className="input-field" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></Field>
          <Field label="To"><input type="date" className="input-field" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></Field>
          <Field label="Activity"><select className="input-field" value={filters.type} onChange={(e) => setFilter('type', e.target.value)}><option value="">All</option>{ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
          <Field label="Machine"><select className="input-field" value={filters.equipmentId} onChange={(e) => setFilter('equipmentId', e.target.value)}><option value="">All</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Owned by"><select className="input-field" value={filters.ownership} onChange={(e) => setFilter('ownership', e.target.value)}><option value="">All</option><option value="AMCOS">AMCOS</option><option value="EXTERNAL">External</option></select></Field>
          <Field label="Status"><select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All</option>{STATUSES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
          <Field label="Fee"><select className="input-field" value={filters.feeStatus} onChange={(e) => setFilter('feeStatus', e.target.value)}><option value="">All</option><option value="PENDING">Due</option><option value="PAID">Paid</option><option value="NOT_APPLICABLE">No fee</option></select></Field>
        </Filters>
        {loading && !data ? <TableSkeleton cols={9} /> : !data?.data.length ? (
          <Empty title={filtered ? 'No jobs match these filters' : 'No jobs recorded yet'} hint={filtered ? undefined : 'Record ploughing, harvesting and other machine work as it happens.'}
            action={!filtered && canWrite ? <button type="button" className="btn-primary" onClick={() => setForm({})}>Record a job</button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Activity</th><th>Machine</th><th>Operator</th><th>Where</th><th className="num">Hectares</th><th className="num">Fee to AMCOS</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.data.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.activityDate)}</td>
                    <td style={{ fontWeight: 600 }}>{titleCase(r.type)}</td>
                    <td>{r.equipment.name}<div className="muted" style={{ fontSize: 11 }}>{r.equipment.ownership === 'AMCOS' ? 'AMCOS-owned' : `External · ${r.equipment.ownerName}`}</div></td>
                    <td>{r.operatorName ?? '—'}</td>
                    <td>{r.block?.code ?? r.location ?? '—'}</td>
                    <td className="num">{fmtNum(r.hectares, 2)}</td>
                    <td className="num">{r.feeStatus === 'NOT_APPLICABLE' ? <span className="muted">—</span> : <>{tzs(r.feeAmount)} <span className={`badge ${FEE_TONE[r.feeStatus]}`}>{FEE_LABEL[r.feeStatus]}</span>{r.feePaidOn && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(r.feePaidOn)}</div>}</>}</td>
                    <td><StatusBadge value={r.status} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && <>
                        {r.status === 'COMPLETED' && r.feeStatus === 'PENDING' && <button type="button" className="btn-primary" onClick={() => setPaying(r)}>Fee paid</button>}{' '}
                        <button type="button" className="btn-secondary" onClick={() => setForm({ activity: r })}>Edit</button>{' '}
                        {r.status !== 'CANCELLED' && r.feeStatus !== 'PAID' && <button type="button" className="btn-secondary" onClick={() => setCancelling(r)}>Cancel</button>}
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>

      {canWrite && <div style={{ marginTop: 12 }}><button type="button" className="btn-primary" onClick={() => setForm({})}>Record a job</button></div>}
      {form && <ActivityModal activity={form.activity} equipment={form.activity ? equipment : activeEquipment} blocks={blocks} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setMessage(m); reload(); }} />}
      {paying && <FeePaidModal activity={paying} onClose={() => setPaying(null)} onSaved={(m) => { setPaying(null); setMessage(m); reload(); }} />}
      {cancelling && (
        <ConfirmDialog title="Cancel this job" danger confirmLabel="Cancel job"
          body={<>Cancel {titleCase(cancelling.type).toLowerCase()} by {cancelling.equipment.name} on {fmtDate(cancelling.activityDate)}? It stops counting toward hectares and any fee due is dropped. The record stays in the list.</>}
          onConfirm={async () => { await machineryApi.updateActivity(cancelling.id, { status: 'CANCELLED' }); setMessage('Job cancelled.'); reload(); }}
          onClose={() => setCancelling(null)} />
      )}
    </>
  );
}

function Equipment({ canWrite }: { canWrite: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const { data, loading, error, reload } = useApi<any[]>(() => machineryApi.equipment({ includeInactive: showAll ? 'true' : undefined }), [showAll]);
  const [form, setForm] = useState<{ item?: any } | null>(null);
  const [message, setMessage] = useState('');
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <div className="section-toolbar">
          <strong>Machines registered with your AMCOS</strong>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label className="muted" style={{ fontSize: 12 }}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show out-of-service</label>
            {canWrite && <button type="button" className="btn-primary" onClick={() => setForm({})}>Register machine</button>}
          </span>
        </div>
        {loading && !data ? <TableSkeleton cols={8} /> : !data?.length ? (
          <Empty title="No machines registered" hint="Register the tractors, harvesters and other machines your AMCOS uses, including privately owned ones that work under the AMCOS."
            action={canWrite ? <button type="button" className="btn-primary" onClick={() => setForm({})}>Register machine</button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Machine</th><th>Type</th><th>Owned by</th><th className="num">Fee / ha</th><th className="num">Jobs</th><th className="num">Hectares</th><th className="num">Fees earned</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td><div style={{ fontWeight: 600 }}>{e.name}</div>{e.registrationNo && <div className="muted" style={{ fontSize: 11 }}>{e.registrationNo}</div>}</td>
                    <td>{titleCase(e.type)}</td>
                    <td>{e.ownership === 'AMCOS' ? 'AMCOS' : <>{e.ownerName}<div className="muted" style={{ fontSize: 11 }}>{e.ownerPhone ?? 'External'}</div></>}</td>
                    <td className="num">{e.feePerHectare == null ? '—' : tzs(e.feePerHectare)}</td>
                    <td className="num">{e.jobs}</td><td className="num">{fmtNum(e.hectaresWorked, 1)}</td><td className="num">{e.feesEarned ? tzs(e.feesEarned) : '—'}</td>
                    <td><span className={`badge ${e.isActive ? 'badge-green' : 'badge-gray'}`}>{e.isActive ? 'In service' : 'Out of service'}</span></td>
                    <td>{canWrite && <button type="button" className="btn-secondary" onClick={() => setForm({ item: e })}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {form && <EquipmentModal item={form.item} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setMessage(m); reload(); }} />}
    </>
  );
}

/** Task Management: everything the AMCOS's machinery has done, and the machines behind it. */
export default function TaskManagementPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'activities' | 'equipment'>('activities');
  const equipment = useApi<any[]>(() => machineryApi.equipment({ includeInactive: 'true' }), [tab]);
  const blocks = useApi<any>(can('irrigation', 'VIEW') ? () => irrigationApi.blocks({ pageSize: 200 }) : null, []);
  const canWrite = can('machinery', 'CREATE');

  if (!user?.mamcosId) {
    return <><PageHeader title="Task Management" /><Empty title="Task Management belongs to an AMCOS" hint="Sign in with an AMCOS account to see its machinery and jobs." /></>;
  }
  return (
    <div>
      <PageHeader title="Task Management" subtitle="Everything your AMCOS machinery has done: preparation, harvesting and more, with hectares covered and fees contributed to the AMCOS." />
      <Tabs tabs={[{ id: 'activities', label: 'Jobs done' }, { id: 'equipment', label: 'Machines' }]} active={tab} onChange={setTab} />
      {tab === 'activities'
        ? <Activities equipment={equipment.data ?? []} blocks={blocks.data?.data ?? []} canWrite={canWrite} />
        : <Equipment canWrite={can('machinery', 'EDIT')} />}
    </div>
  );
}
