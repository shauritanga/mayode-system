'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { day, label } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, Status, Toolbar, useAction, useLoad } from './ui';
import TaskDetail, { ACTIVITIES, PRIORITIES } from './TaskDetail';

/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUSES = ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_REVIEW', 'RETURNED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

export default function TasksPanel({ canCreate, canReview, canCancel }: { canCreate: boolean; canReview: boolean; canCancel: boolean }) {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | 'TASK' | 'INSPECTION'>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.tasks({ status: status || undefined, type: type || undefined, overdue: overdue ? 'true' : undefined, q: q || undefined }), [status, type, overdue, q]);
  return (
    <>
      <Toolbar right={canCreate && <><button className="btn-secondary" onClick={() => setCreating('INSPECTION')}>New inspection</button><button className="btn-primary" onClick={() => setCreating('TASK')}>New task</button></>}>
        <Field label="Status"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
        <Field label="Kind"><select className="input-field" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tasks and inspections</option><option value="TASK">Tasks</option><option value="INSPECTION">Inspections</option></select></Field>
        <Field label="Search"><input className="input-field" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />Overdue only</label>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(t) => t.id} onRow={(t) => setOpen(t.id)} empty="No tasks match."
          columns={[{ header: 'Task', render: (t) => <strong>{t.reference}</strong> }, { header: 'What', render: (t) => t.title }, { header: 'Activity', render: (t) => label(t.activityType) }, { header: 'Where', render: (t) => `${t.farm.name}${t.plot ? ` · ${t.plot.name ?? t.plot.plotCode}` : ''}` },
            { header: 'Assigned to', render: (t) => t.assigneeName ?? '—' }, { header: 'Deadline', render: (t) => <span style={t.overdue ? { color: 'var(--red-500)' } : undefined}>{day(t.deadline)}</span> }, { header: 'Priority', render: (t) => label(t.priority) }, { header: 'Status', render: (t) => <Status value={t.status} /> }]} />
      )}
      {open && <TaskModal id={open} canReview={canReview} canCancel={canCancel} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewTaskModal kind={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); reload(); }} />}
    </>
  );
}

interface FollowUp { title: string; activityType: string; assigneeUserId: string; deadline: string }
function TaskModal({ id, canReview, canCancel, onClose, onChanged }: { id: string; canReview: boolean; canCancel: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: t, error: loadError, reload } = useLoad<any>(() => opsApi.task(id), [id]);
  const { data: people } = useLoad<any[]>(() => opsApi.assignees());
  const [panel, setPanel] = useState<null | 'review' | 'cancel'>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'RETURN' | 'REJECT'>('APPROVE');
  const [comment, setComment] = useState('');
  const [follow, setFollow] = useState<FollowUp[]>([]);
  const { busy, error, run } = useAction();
  if (!t) return <Modal title="Task" onClose={onClose} footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>{loadError ? <ErrorNote message={loadError} /> : <Loading />}</Modal>;
  const act = async (fn: () => Promise<unknown>) => { if ((await run(fn)) !== undefined) { setPanel(null); await reload(); onChanged(); } };
  const closed = ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(t.status);
  return (
    <Modal title={`${t.reference} · ${t.title}`} width="860px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button>
        {canCancel && !closed && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => { setPanel('cancel'); setComment(''); }}>Cancel task…</button>}
        {canReview && t.status === 'PENDING_REVIEW' && <button className="btn-primary" onClick={() => { setPanel('review'); setComment(''); }}>Review…</button>}</>}>
      <ErrorNote message={error} />
      {panel === 'cancel' && <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
        <Field label="Reason" wide><input className="input-field" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !comment.trim()} onClick={() => act(() => opsApi.cancelTask(id, comment))}>Cancel the task</button></div>}
      {panel === 'review' && (
        <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
          <FormGrid>
            <Field label="Decision"><select className="input-field" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="APPROVE">Approve the work</option><option value="RETURN">Send back to be redone</option><option value="REJECT">Reject</option></select></Field>
            <Field label={decision === 'APPROVE' ? 'Comment (optional)' : 'Say why, so the worker knows what to do next'} wide><input className="input-field" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          </FormGrid>
          {decision === 'APPROVE' && (<div style={{ marginTop: 10 }}>
            {follow.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <input className="input-field" style={{ flex: 2, minWidth: 140 }} placeholder="Follow-up task" value={f.title} onChange={(e) => setFollow((a) => a.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
                <select className="input-field" style={{ flex: 1, minWidth: 130 }} value={f.activityType} onChange={(e) => setFollow((a) => a.map((x, k) => (k === i ? { ...x, activityType: e.target.value } : x)))}>{ACTIVITIES.map((a) => <option key={a} value={a}>{label(a)}</option>)}</select>
                <select className="input-field" style={{ flex: 1, minWidth: 130 }} value={f.assigneeUserId} onChange={(e) => setFollow((a) => a.map((x, k) => (k === i ? { ...x, assigneeUserId: e.target.value } : x)))}><option value="">Assign to…</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <input className="input-field" style={{ flex: 1, minWidth: 130 }} type="date" value={f.deadline} onChange={(e) => setFollow((a) => a.map((x, k) => (k === i ? { ...x, deadline: e.target.value } : x)))} />
                <button className="btn-secondary" onClick={() => setFollow((a) => a.filter((_, k) => k !== i))}>Remove</button>
              </div>
            ))}
            <button className="btn-secondary" onClick={() => setFollow((a) => [...a, { title: '', activityType: 'WEEDING', assigneeUserId: '', deadline: '' }])}>Add a follow-up task</button>
          </div>)}
          <button className="btn-primary" style={{ marginTop: 10 }} disabled={busy || (decision !== 'APPROVE' && !comment.trim()) || (decision === 'APPROVE' && follow.some((f) => !f.title.trim() || !f.assigneeUserId))}
            onClick={() => act(() => opsApi.reviewTask(id, { decision, comment: comment || undefined, followUps: decision === 'APPROVE' && follow.length ? follow.map((f) => ({ title: f.title, activityType: f.activityType, assigneeUserId: f.assigneeUserId, deadline: f.deadline ? new Date(f.deadline).toISOString() : undefined })) : undefined }))}>Save decision</button>
        </div>
      )}
      <TaskDetail t={t} />
    </Modal>
  );
}

function NewTaskModal({ kind, onClose, onSaved }: { kind: 'TASK' | 'INSPECTION'; onClose: () => void; onSaved: () => void }) {
  const { data: farms } = useLoad<any[]>(() => opsApi.farms({ active: 'true' }));
  const { data: people } = useLoad<any[]>(() => opsApi.assignees());
  const [f, setF] = useState({ farmId: '', plotId: '', cropCycleId: '', activityType: 'WEEDING', title: '', instructions: '', assigneeUserId: '', reviewerUserId: '', plannedStart: '', deadline: '', expectedOutput: '', requiredInputs: '', priority: 'NORMAL', requireGps: true, geofenceM: '300', objective: '' });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, run } = useAction();
  const farm = farms?.find((x) => x.id === f.farmId);
  const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);
  const valid = f.farmId && f.assigneeUserId && (kind === 'TASK' ? f.title.trim() : f.objective.trim() && f.deadline);
  const submit = async () => {
    const common = { farmId: f.farmId, plotId: f.plotId || undefined, cropCycleId: f.cropCycleId || undefined, assigneeUserId: f.assigneeUserId, reviewerUserId: f.reviewerUserId || undefined };
    const r = await run(() => (kind === 'TASK'
      ? opsApi.createTask({ ...common, activityType: f.activityType, title: f.title, instructions: f.instructions || undefined, plannedStart: iso(f.plannedStart), deadline: iso(f.deadline), expectedOutput: f.expectedOutput || undefined, requiredInputs: f.requiredInputs || undefined, priority: f.priority, requireGps: f.requireGps, geofenceM: Number(f.geofenceM) || undefined })
      : opsApi.createInspection({ ...common, objective: f.objective, scheduledFor: iso(f.deadline), geofenceM: Number(f.geofenceM) || undefined })));
    if (r !== undefined) onSaved();
  };
  return (
    <Modal title={kind === 'TASK' ? 'New farm task' : 'New inspection'} subtitle="The person is notified straight away." width="800px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !valid} onClick={submit}>{busy ? 'Saving…' : 'Assign'}</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Farm"><select className="input-field" value={f.farmId} onChange={(e) => { set('farmId', e.target.value); set('plotId', ''); set('cropCycleId', ''); }}><option value="">Choose…</option>{farms?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Plot"><select className="input-field" value={f.plotId} onChange={(e) => set('plotId', e.target.value)}><option value="">Whole farm</option>{farm?.plots.map((p: any) => <option key={p.id} value={p.id}>{p.name ?? p.plotCode}</option>)}</select></Field>
        <Field label="Crop season"><select className="input-field" value={f.cropCycleId} onChange={(e) => set('cropCycleId', e.target.value)}><option value="">Not linked</option>{farm?.cropCycles.filter((c: any) => !f.plotId || c.plotId === f.plotId).map((c: any) => <option key={c.id} value={c.id}>{c.season}{c.riceVariety ? ` · ${c.riceVariety}` : ''}</option>)}</select></Field>
        <Field label="Assign to"><select className="input-field" value={f.assigneeUserId} onChange={(e) => set('assigneeUserId', e.target.value)}><option value="">Choose…</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></Field>
        <Field label="Reviewer" hint="Defaults to you. Cannot be the person doing the work."><select className="input-field" value={f.reviewerUserId} onChange={(e) => set('reviewerUserId', e.target.value)}><option value="">Me</option>{people?.filter((p) => p.id !== f.assigneeUserId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label={kind === 'TASK' ? 'Deadline' : 'Date of inspection'}><input className="input-field" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
        {kind === 'TASK' ? (<>
          <Field label="Activity"><select className="input-field" value={f.activityType} onChange={(e) => set('activityType', e.target.value)}>{ACTIVITIES.map((a) => <option key={a} value={a}>{label(a)}</option>)}</select></Field>
          <Field label="Title"><input className="input-field" value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Priority"><select className="input-field" value={f.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Planned start"><input className="input-field" type="date" value={f.plannedStart} onChange={(e) => set('plannedStart', e.target.value)} /></Field>
          <Field label="Instructions" wide><input className="input-field" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} /></Field>
          <Field label="Expected output"><input className="input-field" value={f.expectedOutput} onChange={(e) => set('expectedOutput', e.target.value)} /></Field>
          <Field label="Inputs needed"><input className="input-field" value={f.requiredInputs} onChange={(e) => set('requiredInputs', e.target.value)} /></Field>
        </>) : (
          <Field label="What should be checked" wide><input className="input-field" value={f.objective} onChange={(e) => set('objective', e.target.value)} /></Field>
        )}
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.requireGps} onChange={(e) => set('requireGps', e.target.checked)} />Worker must check in at the plot</label>
        <Field label="Distance allowed from the plot (m)"><input className="input-field" type="number" value={f.geofenceM} onChange={(e) => set('geofenceM', e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}
