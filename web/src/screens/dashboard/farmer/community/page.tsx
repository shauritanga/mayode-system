'use client';
import { useCallback, useEffect, useState } from 'react';
import { governanceApi } from '@/lib/api';
import { apiError } from '@/lib/download';
import { EmptyState, InsightPanel, money } from '@/components/role-dashboards/DashboardPrimitives';

export default function FarmerCommunityPage() {
  const [projects, setProjects] = useState<any[]>([]); const [meetings, setMeetings] = useState<any[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const [p, m] = await Promise.all([governanceApi.projects(), governanceApi.meetings()]); setProjects(p.data); setMeetings(m.data); }
    catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="page-shell"><h1 className="page-title">Cooperative updates</h1><p className="page-subtitle">Community projects, meeting decisions, and how cooperative funds are used.</p>
    {error && <div className="alert-box alert-danger" role="alert">{error}<button className="btn-secondary" onClick={() => void load()}>Retry</button></div>}
    {loading ? <p>Loading cooperative records…</p> : <div className="role-two-col"><InsightPanel title="Community projects"><div className="role-list">{projects.map((p) => <article className="role-list-item" key={p.id}><div><strong>{p.name}</strong><p>{p.fundingSource} · {p.status}</p><p>Budget {money(p.budget)} · Spent {money(p.spentAmount)}</p>{Array.isArray(p.milestones?.items) && <ul>{p.milestones.items.map((m: any, i: number) => <li key={i}>{m.title} — {m.completed ? 'Completed' : 'Pending'}</li>)}</ul>}</div></article>)}{!projects.length && <EmptyState>No published community projects.</EmptyState>}</div></InsightPanel><InsightPanel title="Meetings and decisions"><div className="role-list">{meetings.map((m) => <article className="role-list-item" key={m.id}><div><strong>{m.agenda}</strong><p>{new Date(m.meetingDate).toLocaleDateString()} · {m.attendeeCount} attendees</p><p>{m.decisions}</p></div></article>)}{!meetings.length && <EmptyState>No meeting records published.</EmptyState>}</div></InsightPanel></div>}
  </div>;
}
