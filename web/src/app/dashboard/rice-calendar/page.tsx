'use client';

import { useEffect, useState } from 'react';
import { mamcosApi, riceProtocolsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type Protocol = { id: string; name: string; version: number; isActive: boolean; taskDefinitions: unknown[]; updatedAt: string };
type TaskDefinition = { key: string; title: string; guidance: string; daysFromPlanting?: number; daysFromHarvest?: number; activityType?: string; requiredMeasurements?: Record<string, unknown>; evidenceRequired?: boolean };

export default function RiceCalendarPage() {
  const role = useAuthStore((state) => state.user?.role);
  const [mamcosId, setMamcosId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (role !== 'MAMCOS_SECRETARY') { setLoading(false); return; }
    mamcosApi.dashboard().then((res) => { setMamcosId(res.data?.mamcos?.id ?? null); }).catch(() => setMessage('Unable to identify your cooperative.')).finally(() => setLoading(false));
  }, [role]);
  useEffect(() => {
    if (!mamcosId) return;
    riceProtocolsApi.list(mamcosId).then((res) => {
      const active = (res.data as Protocol[]).find((item) => item.isActive) ?? null;
      setProtocol(active); setTasks((active?.taskDefinitions ?? []) as TaskDefinition[]);
    }).catch(() => setMessage('Unable to load the rice calendar.'));
  }, [mamcosId]);
  const bootstrap = async () => {
    if (!mamcosId) return;
    setSaving(true); setMessage('');
    try { const res = await riceProtocolsApi.bootstrap(mamcosId); setProtocol(res.data); setTasks((res.data.taskDefinitions ?? []) as TaskDefinition[]); setMessage('The Mbalari rice calendar is ready.'); } catch { setMessage('Could not create the calendar.'); } finally { setSaving(false); }
  };
  const updateTask = (index: number, patch: Partial<TaskDefinition>) => setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...patch } : task));
  const save = async () => {
    if (!protocol) return;
    setSaving(true); setMessage('');
    try { const res = await riceProtocolsApi.update(protocol.id, { name: protocol.name, taskDefinitions: tasks }); setProtocol(res.data); setTasks((res.data.taskDefinitions ?? []) as TaskDefinition[]); setMessage(`Saved as version ${res.data.version}. New crop cycles will use it.`); } catch (error: any) { setMessage(error?.response?.data?.message || 'Could not save the calendar.'); } finally { setSaving(false); }
  };
  const measurementText = (measurement: unknown) => {
    const rule = measurement as { label?: string; unit?: string; min?: number; max?: number };
    const range = rule.min != null || rule.max != null ? ` ${rule.min ?? '...'}-${rule.max ?? '...'}` : '';
    return `${rule.label || 'Measurement'}${range}${rule.unit ? ` ${rule.unit}` : ''}`;
  };
  if (loading) return <div style={{ padding: 32 }}>Loading rice calendar…</div>;
  if (role !== 'MAMCOS_SECRETARY') return <div><h1>Rice Calendar</h1><p>This Mbalari cooperative configuration is managed by the cooperative secretary.</p></div>;
  return <div className="page-shell">
    <div className="page-heading">
      <div>
        <div className="page-kicker">Protocol</div>
        <h1 className="page-title">Mbalari Rice Calendar</h1>
        <p className="page-subtitle">The approved cooperative production standard. New crop cycles receive a snapshot of the active version; existing cycles keep their scheduled tasks.</p>
      </div>
      {protocol && <span className="badge badge-green">Version {protocol.version}</span>}
    </div>
    {message && <div className={`alert-box ${message.includes('Could') || message.includes('Unable') || message.includes('must') ? 'alert-danger' : 'alert-success'}`}>{message}</div>}
    {!protocol ? <div className="action-panel"><div className="panel-header"><div><h2 className="panel-title">No Active Calendar</h2><p className="panel-copy">Create the default Mbalari calendar before new crop cycles can receive task schedules.</p></div></div><button className="btn-primary" disabled={saving} onClick={bootstrap}>{saving ? 'Creating...' : 'Create Mbalari default calendar'}</button></div> : <div className="action-panel">
      <div className="panel-header"><div><h2 className="panel-title">{protocol.name}</h2><p className="panel-copy">Edit the task name, guidance, timing, and photo requirement. Measurement ranges are shown for review and remain attached to the task.</p></div><span className="badge badge-blue">{tasks.length} tasks</span></div>
      <div className="task-list">
        {tasks.map((task, index) => <div key={task.key} className="task-editor-row">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(280px,2fr)', gap: 10 }}>
            <label className="form-label">Task title<input className="input-field" value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} /></label>
            <label className="form-label">Guidance<input className="input-field" value={task.guidance} onChange={(event) => updateTask(index, { guidance: event.target.value })} /></label>
          </div>
          <div className="form-grid" style={{ marginTop: 10, alignItems: 'end' }}>
            <label className="form-label">Days from planting<input className="input-field" type="number" value={task.daysFromPlanting ?? ''} onChange={(event) => updateTask(index, { daysFromPlanting: event.target.value === '' ? undefined : Number(event.target.value), daysFromHarvest: event.target.value === '' ? task.daysFromHarvest : undefined })} /></label>
            <label className="form-label">Days from harvest<input className="input-field" type="number" value={task.daysFromHarvest ?? ''} onChange={(event) => updateTask(index, { daysFromHarvest: event.target.value === '' ? undefined : Number(event.target.value), daysFromPlanting: event.target.value === '' ? task.daysFromPlanting : undefined })} /></label>
            <label className="form-label">Activity<input className="input-field" value={task.activityType ?? ''} onChange={(event) => updateTask(index, { activityType: event.target.value || undefined })} /></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800 }}><input type="checkbox" checked={!!task.evidenceRequired} onChange={(event) => updateTask(index, { evidenceRequired: event.target.checked })} /> Requires photo evidence</label>
          </div>
          <div style={{ marginTop: 8 }}>
            {Object.values(task.requiredMeasurements ?? {}).length ? Object.values(task.requiredMeasurements ?? {}).map((measurement, measurementIndex) => <span className="measurement-chip" key={`${task.key}-${measurementIndex}`}>{measurementText(measurement)}</span>) : <span className="muted" style={{ fontSize: 12 }}>No measurement fields</span>}
          </div>
        </div>)}
      </div>
      <button className="btn-primary" disabled={saving} onClick={save} style={{ marginTop: 14 }}>{saving ? 'Saving…' : 'Save new protocol version'}</button>
    </div>}
  </div>;
}
