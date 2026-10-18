'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { day, label } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, PageHead, Status, Toolbar, useAction, useLoad } from '@/components/ops/ui';
import TaskDetail from '@/components/ops/TaskDetail';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function FieldWorkPage() {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.myTasks({ status: status || undefined }), [status]);
  return (
    <div>
      <PageHead kicker="Mayode Farms" title="My Field Work" subtitle="Your assigned tasks. Check in when you reach the plot, then report what was done." />
      <Toolbar>
        <Field label="Show"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All my tasks</option>{['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_REVIEW', 'RETURNED', 'COMPLETED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(t) => t.id} onRow={(t) => setOpen(t.id)} empty="Nothing has been assigned to you."
          columns={[{ header: 'Task', render: (t) => <strong>{t.reference}</strong> }, { header: 'What', render: (t) => t.title }, { header: 'Where', render: (t) => `${t.farm.name}${t.plot ? ` · ${t.plot.name ?? t.plot.plotCode}` : ''}` },
            { header: 'Deadline', render: (t) => <span style={t.overdue ? { color: 'var(--red-500)' } : undefined}>{day(t.deadline)}</span> }, { header: 'Status', render: (t) => <Status value={t.status} /> }]} />
      )}
      {open && <WorkModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

type Mode = null | 'nogps' | 'report' | 'inspection';

function here(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This device cannot share its location.')); return; }
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location is switched off for this page. Allow it, or start without GPS and say why.' : 'Could not find your location. Move to open ground and try again.')), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

function WorkModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: t, error: loadError, reload } = useLoad<any>(() => opsApi.myTask(id), [id]);
  const { data: inputs } = useLoad<any[]>(() => opsApi.myInputs());
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [rep, setRep] = useState({ workDoneQty: '', workDoneUnit: '', equipment: '', observations: '', incompleteReason: '' });
  const [used, setUsed] = useState<{ itemId: string; quantity: string }[]>([]);
  const [insp, setInsp] = useState({ cropCondition: '', growthStage: '', pests: '', diseases: '', soilWater: '', observations: '', recommendation: '' });
  const [locating, setLocating] = useState(false);
  const { busy, error, run, setError } = useAction();
  if (!t) return <Modal title="Task" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const done = async (fn: () => Promise<unknown>) => { if ((await run(fn)) !== undefined) { setMode(null); await reload(); onChanged(); } };
  const s = t.status;
  const isInspection = t.type === 'INSPECTION';
  const openForWork = ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RETURNED'].includes(s);
  const checkedIn = (t.checkIns as any[]).some((c) => c.kind === 'CHECK_IN');
  const checkedOut = (t.checkIns as any[]).some((c) => c.kind === 'CHECK_OUT');

  const mark = async (kind: 'CHECK_IN' | 'CHECK_OUT') => {
    setLocating(true); setError('');
    try {
      const p = await here();
      await done(() => opsApi.checkIn(id, { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy, deviceTime: new Date().toISOString(), kind, note: note || undefined, clientKey: crypto.randomUUID() }));
      setNote('');
    } catch (e) { setError((e as Error).message); } finally { setLocating(false); }
  };

  return (
    <Modal title={`${t.reference} · ${t.title}`} width="820px" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      <ErrorNote message={error} />
      {openForWork && mode === null && (
        <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {s === 'ASSIGNED' && <button className="btn-secondary" disabled={busy} onClick={() => done(() => opsApi.acknowledgeTask(id))}>I have seen this task</button>}
            {!checkedIn && t.requireGps && <>
              <Field label="Note for this visit (optional)"><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button className="btn-primary" disabled={busy || locating} onClick={() => mark('CHECK_IN')}>{locating ? 'Finding you…' : 'Check in at the plot'}</button>
              <button className="btn-secondary" disabled={busy} onClick={() => { setError(''); setMode('nogps'); }}>Start without GPS</button>
            </>}
            {checkedIn && !checkedOut && <button className="btn-secondary" disabled={busy || locating} onClick={() => mark('CHECK_OUT')}>{locating ? 'Finding you…' : 'Check out'}</button>}
            {(checkedIn || !t.requireGps || s === 'IN_PROGRESS') && (isInspection
              ? <button className="btn-primary" onClick={() => { setError(''); setMode('inspection'); }}>Write the inspection report</button>
              : <button className="btn-primary" onClick={() => { setError(''); setMode('report'); }}>Report the work done</button>)}
          </div>
        </div>
      )}

      {mode === 'nogps' && (
        <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
          <Field label="Why can’t your location be recorded?" wide><input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn-primary" disabled={busy || !reason.trim()} onClick={() => done(() => opsApi.startWithoutGps(id, reason))}>Start the task</button><button className="btn-secondary" onClick={() => setMode(null)}>Back</button></div>
        </div>
      )}

      {mode === 'report' && (
        <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
          <FormGrid>
            <Field label="How much was done"><input className="input-field" type="number" value={rep.workDoneQty} onChange={(e) => setRep({ ...rep, workDoneQty: e.target.value })} /></Field>
            <Field label="Unit (acres, bags, hours…)"><input className="input-field" value={rep.workDoneUnit} onChange={(e) => setRep({ ...rep, workDoneUnit: e.target.value })} /></Field>
            <Field label="Equipment used"><input className="input-field" value={rep.equipment} onChange={(e) => setRep({ ...rep, equipment: e.target.value })} /></Field>
            <Field label="What you saw and did" wide><input className="input-field" value={rep.observations} onChange={(e) => setRep({ ...rep, observations: e.target.value })} /></Field>
            <Field label="If not finished, why?" wide><input className="input-field" value={rep.incompleteReason} onChange={(e) => setRep({ ...rep, incompleteReason: e.target.value })} /></Field>
          </FormGrid>
          <h4 style={{ margin: '12px 0 6px', fontSize: 13 }}>Inputs used</h4>
          {used.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <select className="input-field" style={{ flex: 2 }} value={u.itemId} onChange={(e) => setUsed((a) => a.map((x, k) => (k === i ? { ...x, itemId: e.target.value } : x)))}><option value="">Choose…</option>{inputs?.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.balance} {x.unit} in stock)</option>)}</select>
              <input className="input-field" style={{ flex: 1 }} type="number" placeholder="Quantity" value={u.quantity} onChange={(e) => setUsed((a) => a.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} />
              <button className="btn-secondary" onClick={() => setUsed((a) => a.filter((_, k) => k !== i))}>Remove</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => setUsed((a) => [...a, { itemId: '', quantity: '' }])}>Add an input</button>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" disabled={busy || (!rep.observations.trim() && !rep.incompleteReason.trim()) || used.some((u) => !u.itemId || !(Number(u.quantity) > 0))}
              onClick={() => done(() => opsApi.submitReport(id, { workDoneQty: rep.workDoneQty ? Number(rep.workDoneQty) : undefined, workDoneUnit: rep.workDoneUnit || undefined, equipment: rep.equipment || undefined, observations: rep.observations || undefined, incompleteReason: rep.incompleteReason || undefined, inputs: used.length ? used.map((u) => ({ itemId: u.itemId, quantity: Number(u.quantity) })) : undefined }))}>Send for review</button>
            <button className="btn-secondary" onClick={() => setMode(null)}>Back</button>
          </div>
        </div>
      )}

      {mode === 'inspection' && (
        <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
          <FormGrid>
            <Field label="Crop condition"><input className="input-field" value={insp.cropCondition} onChange={(e) => setInsp({ ...insp, cropCondition: e.target.value })} /></Field>
            <Field label="Growth stage"><input className="input-field" value={insp.growthStage} onChange={(e) => setInsp({ ...insp, growthStage: e.target.value })} /></Field>
            <Field label="Pests seen"><input className="input-field" value={insp.pests} onChange={(e) => setInsp({ ...insp, pests: e.target.value })} /></Field>
            <Field label="Diseases seen"><input className="input-field" value={insp.diseases} onChange={(e) => setInsp({ ...insp, diseases: e.target.value })} /></Field>
            <Field label="Soil and water"><input className="input-field" value={insp.soilWater} onChange={(e) => setInsp({ ...insp, soilWater: e.target.value })} /></Field>
            <Field label="Other observations" wide><input className="input-field" value={insp.observations} onChange={(e) => setInsp({ ...insp, observations: e.target.value })} /></Field>
            <Field label="What should be done next" wide><input className="input-field" value={insp.recommendation} onChange={(e) => setInsp({ ...insp, recommendation: e.target.value })} /></Field>
          </FormGrid>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" disabled={busy || !(insp.cropCondition.trim() || insp.observations.trim())}
              onClick={() => done(() => opsApi.submitInspection(id, { cropCondition: insp.cropCondition || undefined, growthStage: insp.growthStage || undefined, pests: insp.pests || undefined, diseases: insp.diseases || undefined, soilWater: insp.soilWater || undefined, observations: insp.observations || undefined, recommendations: insp.recommendation.trim() ? [{ text: insp.recommendation }] : undefined }))}>Send for review</button>
            <button className="btn-secondary" onClick={() => setMode(null)}>Back</button>
          </div>
        </div>
      )}
      <TaskDetail t={t} />
    </Modal>
  );
}
