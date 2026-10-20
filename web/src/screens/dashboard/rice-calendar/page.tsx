'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

import { useCallback, useEffect, useState } from 'react';
import { riceProtocolsApi, riceVarietiesApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { APP_MODE } from '@/lib/app-mode';
import { hasPermission } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';
import ErrorBanner from '@/components/ErrorBanner';
import VarietiesPanel, { type Variety } from './VarietiesPanel';

type Protocol = { id: string; name: string; version: number; isActive: boolean; seasonStart?: string | null; taskDefinitions: unknown[]; updatedAt: string };
type TaskDefinition = {
  key: string; title: string; guidance: string; daysFromPlanting?: number; daysFromHarvest?: number;
  activityType?: string; requiredMeasurements?: Record<string, unknown>; evidenceRequired?: boolean; stageName?: string | null;
};
type Upcoming = { cropCycleId: string; farmCode: string; farmer: string; season: string; taskKey: string; title: string; stageName?: string | null; dueDate: string; overdue: boolean };

/** What completing a task records in Crop Activities. The values are the system's activity types. */
const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None (not field work)' },
  { value: 'LAND_PREPARATION', label: 'Land preparation' },
  { value: 'PLANTING', label: 'Planting' },
  { value: 'FERTILIZING', label: 'Fertilizing' },
  { value: 'WEEDING', label: 'Weeding' },
  { value: 'PEST_CONTROL', label: 'Pest control' },
  { value: 'IRRIGATION', label: 'Irrigation' },
  { value: 'HARVESTING', label: 'Harvesting' },
  { value: 'DRYING', label: 'Drying' },
  { value: 'STORAGE', label: 'Storage' },
  { value: 'TRANSPORT', label: 'Transport' },
];

/** The harvest quality check and warehouse intake depend on these, so they can be edited but not removed. */
const REQUIRED_KEYS = ['harvest', 'drying', 'bagging'];

const timing = (t: TaskDefinition) =>
  t.daysFromHarvest != null ? `${t.daysFromHarvest >= 0 ? '+' : ''}${t.daysFromHarvest} days from harvest`
    : t.daysFromPlanting != null ? `${t.daysFromPlanting >= 0 ? 'Day ' : ''}${t.daysFromPlanting} from planting` : '—';

export default function RiceCalendarPage() {
  const user = useAuthStore((s) => s.user);
  const isPlatform = APP_MODE === 'admin';
  const mamcosId = user?.mamcosId ?? null;
  const canEdit = isPlatform ? user?.role === 'SUPER_ADMIN' : hasPermission(user, 'rice_protocols', 'EDIT');
  const canCreate = isPlatform ? user?.role === 'SUPER_ADMIN' : hasPermission(user, 'rice_protocols', 'CREATE');

  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [platformTasks, setPlatformTasks] = useState<TaskDefinition[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  /** '' is the default calendar, used by any variety that has none of its own. */
  const [varietyId, setVarietyId] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  /** The planting date this calendar is laid out from (YYYY-MM-DD), so the day counts can be read as real dates. */
  const [seasonStart, setSeasonStart] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const apply = (p: Protocol | null) => {
    setProtocol(p);
    setTasks((p?.taskDefinitions ?? []) as TaskDefinition[]);
    setSeasonStart(p?.seasonStart ? p.seasonStart.slice(0, 10) : '');
    setOpen(new Set());
  };

  const fetchAll = useCallback(() => {
    const run: Promise<void> = isPlatform
      ? Promise.all([riceProtocolsApi.platformVersions(varietyId || undefined), riceVarietiesApi.list(true)]).then(([res, vs]) => {
        apply((res.data as Protocol[]).find((p) => p.isActive) ?? null);
        setVarieties(vs.data as Variety[]);
      })
      : mamcosId
        ? Promise.allSettled([riceProtocolsApi.list(mamcosId), riceProtocolsApi.platformActive(), riceProtocolsApi.upcoming(mamcosId)])
          .then(([own, platform, soon]) => {
            if (own.status === 'rejected') throw own.reason;
            apply((own.value.data as Protocol[]).find((p) => p.isActive) ?? null);
            setPlatformTasks(platform.status === 'fulfilled' ? (platform.value.data?.tasks ?? []) : []);
            setUpcoming(soon.status === 'fulfilled' ? soon.value.data ?? [] : []);
          })
        : Promise.resolve();
    return run
      .then(() => setError(''))
      .catch((e) => setError(apiErrorMessage(e, 'Unable to load the rice calendar.')))
      .finally(() => setLoading(false));
  }, [isPlatform, mamcosId, varietyId]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const bootstrap = async () => {
    setSaving(true); setMessage('');
    try {
      const res = isPlatform ? await riceProtocolsApi.platformBootstrap(varietyId || undefined, copyFrom || undefined) : await riceProtocolsApi.bootstrap(mamcosId!);
      apply(res.data); setMessage('The calendar is ready.');
    } catch (e) { setError(apiErrorMessage(e, 'Could not create the calendar.')); } finally { setSaving(false); }
  };

  const updateTask = (i: number, patch: Partial<TaskDefinition>) => setTasks((cur) => cur.map((t, n) => (n === i ? { ...t, ...patch } : t)));
  const addTask = () => setTasks((cur) => [...cur, { key: `custom_${Date.now().toString(36)}`, title: '', guidance: '', daysFromPlanting: 0 }]);
  const removeTask = (i: number) => setTasks((cur) => cur.filter((_, n) => n !== i));

  const save = async () => {
    if (!protocol) return;
    const incomplete = tasks.find((t) => !t.title.trim() || !t.guidance.trim());
    if (incomplete) { setOpen((cur) => new Set(cur).add(incomplete.key)); setError('Every task needs a name and a short instruction. The task that is missing one is open below.'); return; }
    setSaving(true); setMessage(''); setError('');
    try {
      const res = await riceProtocolsApi.update(protocol.id, { name: protocol.name, seasonStart: seasonStart || null, taskDefinitions: tasks.map((t) => ({ ...t, title: t.title.trim(), guidance: t.guidance.trim() })) });
      apply(res.data);
      setMessage(isPlatform
        ? `Saved as version ${res.data.version}. Farmers' crop cycles created from now on follow it; cycles already scheduled keep their tasks.`
        : `Saved as version ${res.data.version}. This is your cooperative's own calendar; it does not change what farmers see in the app.`);
    } catch (e) { setError(apiErrorMessage(e, 'Could not save the calendar.')); } finally { setSaving(false); }
  };

  const measurementText = (m: unknown) => {
    const rule = m as { label?: string; unit?: string; min?: number; max?: number };
    const range = rule.min != null || rule.max != null ? ` ${rule.min ?? '...'}-${rule.max ?? '...'}` : '';
    return `${rule.label || 'Measurement'}${range}${rule.unit ? ` ${rule.unit}` : ''}`;
  };

  const selectedVariety = varieties.find((v) => v.id === varietyId);
  /** Days from planting to harvest: the variety's own figure, else wherever this calendar puts the harvest task. */
  const maturityDays = selectedVariety?.maturityDays ?? tasks.find((t) => t.key === 'harvest')?.daysFromPlanting ?? null;
  const startDate = seasonStart ? new Date(`${seasonStart}T00:00:00`) : null;
  const plus = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const harvestDate = startDate && maturityDays != null ? plus(startDate, maturityDays) : null;
  const dateFor = (t: TaskDefinition): Date | null => {
    if (t.daysFromHarvest != null) return harvestDate ? plus(harvestDate, t.daysFromHarvest) : null;
    return startDate && t.daysFromPlanting != null ? plus(startDate, t.daysFromPlanting) : null;
  };
  const toggleOpen = (key: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const setTiming = (i: number, mode: 'planting' | 'harvest', days: number | undefined) =>
    updateTask(i, mode === 'harvest' ? { daysFromHarvest: days, daysFromPlanting: undefined } : { daysFromPlanting: days, daysFromHarvest: undefined });

  if (loading) return <div style={{ padding: 32 }}><TableSkeleton rows={6} avatar={false} /></div>;
  if (!isPlatform && !mamcosId) return <div className="page-shell"><h1 className="page-title">Rice Calendar</h1><p>Your account is not attached to a cooperative.</p></div>;

  return <div className="page-shell">
    <div className="page-heading">
      <div>
        <div className="page-kicker">{isPlatform ? 'Platform' : 'Cooperative'}</div>
        <h1 className="page-title">{isPlatform ? 'Platform Rice Calendar' : 'Our Rice Calendar'}</h1>
        <p className="page-subtitle">
          {isPlatform
            ? 'The calendar every farmer sees in the mobile app. Crop cycles created from now on get these tasks; cycles already scheduled keep theirs. Cooperatives can keep their own calendars, which do not change this one.'
            : 'Your cooperative’s own calendar, for your team only. It does not appear in the farmers’ mobile app, and it does not replace the platform calendar they follow.'}
        </p>
      </div>
      {protocol && <span className="badge badge-green">Version {protocol.version}</span>}
    </div>
    {isPlatform && <VarietiesPanel varieties={varieties} canEdit={canEdit} onChanged={fetchAll} onError={setError} />}
    {isPlatform && <div style={{ marginBottom: 16 }}>
      <div className="ua-hint" style={{ marginBottom: 8, fontWeight: 700 }}>Choose a rice variety</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[{ id: '', name: 'Default' } as Variety, ...varieties.filter((v) => v.isActive)].map((v) => (
          <button key={v.id || 'default'} type="button" className={v.id === varietyId ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setLoading(true); setMessage(''); setCopyFrom(''); setVarietyId(v.id); }}>
            {v.name}
          </button>
        ))}
      </div>
      <p className="ua-hint" style={{ margin: '8px 0 0' }}>
        {varietyId
          ? (selectedVariety?.hasCalendar ? `Farmers growing ${selectedVariety.name} follow this calendar.` : `${selectedVariety?.name ?? 'This variety'} has no calendar of its own yet, so farmers follow the Default one.`)
          : 'The Default calendar is used for any variety that has no calendar of its own.'}
      </p>
    </div>}
    <ErrorBanner message={error} onDismiss={() => setError('')} />
    {message && <div className="alert-box alert-success">{message}</div>}

    {!protocol ? <div className="action-panel">
      <div className="panel-header"><div>
        <h2 className="panel-title">{isPlatform ? 'No platform calendar yet' : 'No cooperative calendar yet'}</h2>
        <p className="panel-copy">{isPlatform ? 'Until you create it, farmers’ crop cycles get no task schedule in the app. Start from the Mbalari default and change it.' : 'Start from the Mbalari default and adjust it for your members.'}</p>
      </div></div>
      {canCreate ? <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        {isPlatform && varietyId && <label className="form-label">Start from
          <select className="input-field" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">The default calendar</option>
            {varieties.filter((v) => v.id !== varietyId && v.hasCalendar).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>}
        <button className="btn-primary" disabled={saving} onClick={bootstrap}>{saving ? 'Creating…' : isPlatform && varietyId ? 'Create this variety’s calendar' : 'Create from the Mbalari default'}</button>
      </div> : <p className="ua-hint">You do not have permission to create it.</p>}
    </div> : <div className="action-panel">
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <h2 className="panel-title">{canEdit ? <input className="input-field" aria-label="Calendar name" value={protocol.name} onChange={(e) => setProtocol({ ...protocol, name: e.target.value })} /> : protocol.name}</h2>
          <p className="panel-copy">{canEdit ? 'List what farmers should do and when. Each task is counted in days, and the date next to it is worked out from the planting date below.' : 'Read-only.'}</p>
        </div>
        <span className="badge badge-blue">{tasks.length} tasks</span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end', padding: '14px 16px', margin: '4px 0 16px', background: 'var(--surface-2, rgba(0,0,0,0.03))', borderRadius: 12 }}>
        <label className="form-label" style={{ margin: 0 }}>Planting date for this season
          <input className="input-field" type="date" disabled={!canEdit} value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} />
        </label>
        <div className="ua-hint" style={{ paddingBottom: 8 }}>
          {harvestDate ? <>Harvest is about <b>{fmt(harvestDate)}</b>{selectedVariety?.maturityDays ? ` (${selectedVariety.maturityDays} days after planting)` : ''}.</>
            : startDate ? 'Add the variety\u2019s days to harvest to see the harvest date.'
            : 'Pick a planting date to see the real date beside every task.'}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {tasks.map((task, index) => {
          const locked = REQUIRED_KEYS.includes(task.key);
          const mode: 'planting' | 'harvest' = task.daysFromHarvest != null ? 'harvest' : 'planting';
          const days = mode === 'harvest' ? task.daysFromHarvest : task.daysFromPlanting;
          const date = dateFor(task);
          const isOpen = open.has(task.key);
          return <div key={task.key} style={{ border: '1px solid var(--border, rgba(0,0,0,0.1))', borderRadius: 12, padding: '10px 12px', background: 'var(--surface, #fff)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(160px,1fr) 84px 150px minmax(150px,auto) auto', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 800, fontSize: 13 }}>{index + 1}</span>
              <input className="input-field" aria-label="Task name" placeholder="What should the farmer do?" disabled={!canEdit} value={task.title} onChange={(e) => updateTask(index, { title: e.target.value })} />
              <input className="input-field" aria-label="Number of days" type="number" disabled={!canEdit} value={days ?? ''} onChange={(e) => setTiming(index, mode, e.target.value === '' ? undefined : Number(e.target.value))} />
              <select className="input-field" aria-label="Counted from" disabled={!canEdit} value={mode} onChange={(e) => setTiming(index, e.target.value as 'planting' | 'harvest', days)}>
                <option value="planting">days after planting</option>
                <option value="harvest">days from harvest</option>
              </select>
              <span className={date ? 'badge badge-green' : 'ua-hint'} style={{ whiteSpace: 'nowrap', justifySelf: 'start' }}>{date ? fmt(date) : 'No date yet'}</span>
              <span style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
                <button type="button" className="btn-secondary" aria-expanded={isOpen} onClick={() => toggleOpen(task.key)}>{isOpen ? 'Hide details' : 'Details'}</button>
                {canEdit && <button type="button" className="btn-secondary" disabled={locked} title={locked ? 'Needed for the harvest quality check' : 'Remove this task'} aria-label="Remove task" onClick={() => removeTask(index)}>✕</button>}
              </span>
            </div>
            {isOpen && <div style={{ display: 'grid', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border, rgba(0,0,0,0.12))' }}>
              <label className="form-label">Instruction for the farmer
                <input className="input-field" disabled={!canEdit} value={task.guidance} placeholder="A short, clear instruction" onChange={(e) => updateTask(index, { guidance: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
                <label className="form-label" style={{ margin: 0 }}>Counts as
                  <select className="input-field" disabled={!canEdit} value={task.activityType ?? ''} onChange={(e) => updateTask(index, { activityType: e.target.value || undefined })}>
                    {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, paddingBottom: 8 }}>
                  <input type="checkbox" disabled={!canEdit} checked={!!task.evidenceRequired} onChange={(e) => updateTask(index, { evidenceRequired: e.target.checked })} /> Farmer must add a photo
                </label>
              </div>
              <div>{Object.values(task.requiredMeasurements ?? {}).map((m, mi) => <span className="measurement-chip" key={`${task.key}-${mi}`}>{measurementText(m)}</span>)}</div>
            </div>}
          </div>;
        })}
      </div>
      {canEdit && <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" onClick={addTask}>+ Add a task</button>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save calendar'}</button>
      </div>}
    </div>}

    {!isPlatform && <>
      <div className="action-panel" style={{ marginTop: 16 }}>
        <div className="panel-header"><div><h2 className="panel-title">Coming up for your members</h2><p className="panel-copy">Your calendar laid over your members&rsquo; active crop cycles: due in the next 45 days, or up to 2 weeks overdue.</p></div><span className="badge badge-blue">{upcoming.length}</span></div>
        {upcoming.length === 0 ? <p className="ua-hint">Nothing is due soon, or no member crop cycle has a planting date yet.</p> : <div style={{ overflowX: 'auto' }}><table className="data-table">
          <thead><tr><th>Due</th><th>Task</th><th>Farm</th><th>Farmer</th><th>Season</th></tr></thead>
          <tbody>{upcoming.map((u) => <tr key={`${u.cropCycleId}-${u.taskKey}`}>
            <td style={{ whiteSpace: 'nowrap' }}>{new Date(u.dueDate).toLocaleDateString()} {u.overdue && <span className="badge badge-gold">Overdue</span>}</td>
            <td>{u.title}{u.stageName ? <div className="ua-hint">{u.stageName}</div> : null}</td>
            <td>{u.farmCode}</td><td>{u.farmer}</td><td>{u.season}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>
      <details className="action-panel" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>What farmers see in the app ({platformTasks.length} tasks, set by MAYODE)</summary>
        <p className="ua-hint" style={{ margin: '10px 0' }}>This is the platform calendar. Your cooperative cannot change it.</p>
        {platformTasks.length === 0 ? <p className="ua-hint">The platform calendar has not been created yet.</p> : <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {platformTasks.map((t) => <li key={t.key}><b>{t.title}</b> <span className="ua-hint">· {timing(t)}{t.stageName ? ` · ${t.stageName}` : ''}</span></li>)}
        </ul>}
      </details>
    </>}
  </div>;
}
