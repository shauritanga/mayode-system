'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { governanceApi } from '@/lib/api';
import { hasPermission } from '@/lib/nav';
import { apiError } from '@/lib/download';
import { useAuthStore } from '@/store/auth.store';
import { EmptyState, InsightPanel, money } from '@/components/role-dashboards/DashboardPrimitives';

type Milestone = { title: string; completed: boolean };
type Project = { id: string; name: string; fundingSource: string; budget: number; spentAmount: number; status: string; milestones?: { items?: Milestone[] } };
export default function ProjectsPage() {
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState(''); const [funding, setFunding] = useState('Fairtrade premium fund'); const [budget, setBudget] = useState(''); const [milestones, setMilestones] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setProjects((await governanceApi.projects()).data); } catch (err) { setError(apiError(err)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function action(fn: () => Promise<unknown>) { if (busy) return; setBusy(true); setError(''); try { await fn(); await load(); } catch (err) { setError(apiError(err)); } finally { setBusy(false); } }
  async function create(e: FormEvent) { e.preventDefault(); await action(async () => { await governanceApi.createProject({ name: name.trim(), fundingSource: funding.trim(), budget: Number(budget), milestones: { items: milestones.split('\n').map((s) => s.trim()).filter(Boolean).map((title) => ({ title, completed: false })) } }); setName(''); setBudget(''); setMilestones(''); }); }
  return <div className="page-shell"><h1 className="page-title">Community projects</h1><p className="page-subtitle">Track funding, expenditure, delivery milestones, and decisions visible to members.</p>
    {error && <div className="alert-box alert-danger" role="alert">{error}<button className="btn-secondary" onClick={() => void load()}>Retry</button></div>}
    {hasPermission(user, 'governance', 'CREATE') && <InsightPanel title="Create project"><form className="form-grid" onSubmit={create}><label className="form-label">Project name<input className="input-field" required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="form-label">Funding source<input className="input-field" required value={funding} onChange={(e) => setFunding(e.target.value)} /></label><label className="form-label">Budget (TZS)<input className="input-field" required type="number" min="0.01" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} /></label><label className="form-label form-grid-wide">Milestones (one per line)<textarea className="input-field" value={milestones} onChange={(e) => setMilestones(e.target.value)} /></label><button className="btn-primary" disabled={busy}>Create project</button></form></InsightPanel>}
    {loading ? <p>Loading projects…</p> : projects.map((p) => <InsightPanel key={p.id} title={p.name} subtitle={p.fundingSource}><ProjectEditor project={p} busy={busy} editable={hasPermission(user, 'governance', 'EDIT')} onSave={(data) => action(() => governanceApi.updateProject(p.id, data))} />{hasPermission(user, 'governance', 'DELETE') && <button className="btn-secondary" disabled={busy} onClick={() => { if (window.confirm(`Delete project “${p.name}”?`)) void action(() => governanceApi.removeProject(p.id)); }}>Delete project</button>}</InsightPanel>)}
    {!loading && !projects.length && <EmptyState>No community projects recorded.</EmptyState>}
  </div>;
}
function ProjectEditor({ project: p, busy, editable, onSave }: { project: Project; busy: boolean; editable: boolean; onSave: (data: object) => Promise<void> }) {
  const [spent, setSpent] = useState(String(p.spentAmount)); const [status, setStatus] = useState(p.status); const [items, setItems] = useState<Milestone[]>(p.milestones?.items ?? []);
  const [next, setNext] = useState('');
  const completed = items.filter((m) => m.completed).length;
  return <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void onSave({ spentAmount: Number(spent), status, milestones: { ...p.milestones, items } }); }}>
    <p className="form-grid-wide">Budget {money(p.budget)} · Spent {money(p.spentAmount)} · {completed}/{items.length} milestones complete</p>
    <label className="form-label">Status<select className="input-field" disabled={!editable || busy} value={status} onChange={(e) => setStatus(e.target.value)}>{['OPEN', 'PLANNED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</select></label>
    <label className="form-label">Recorded expenditure (TZS)<input className="input-field" disabled={!editable || busy} required type="number" min="0" step="0.01" value={spent} onChange={(e) => setSpent(e.target.value)} /></label>
    <div className="form-grid-wide">{items.map((m, index) => <label key={index} style={{ display: 'block', marginBottom: 8 }}><input type="checkbox" disabled={!editable || busy} checked={m.completed} onChange={(e) => setItems(items.map((item, i) => i === index ? { ...item, completed: e.target.checked } : item))} /> {m.title}</label>)}</div>
    {editable && <><label className="form-label">New milestone<input className="input-field" value={next} onChange={(e) => setNext(e.target.value)} /></label><button type="button" className="btn-secondary" disabled={!next.trim() || busy} onClick={() => { setItems([...items, { title: next.trim(), completed: false }]); setNext(''); }}>Add milestone</button><button className="btn-primary" disabled={busy}>Save project progress</button></>}
  </form>;
}
