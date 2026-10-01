'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { governanceApi } from '@/lib/api';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerVotesPage() {
  const { votes, run, busy, loading } = useFarmerData();
  return <InsightPanel title="Member voting" subtitle="Cast one vote on cooperative decisions and review published outcomes.">
    {loading && <p>Loading decisions…</p>}
    <div className="role-list">{votes.map((vote) => {
      const now = Date.now();
      const open = vote.status === 'OPEN' && new Date(vote.opensAt).getTime() <= now && new Date(vote.closesAt).getTime() >= now;
      return <div className="role-list-item" key={vote.id}><div><strong>{vote.title}</strong><p>{vote.description}</p><p>{new Date(vote.opensAt).toLocaleString()} – {new Date(vote.closesAt).toLocaleString()}</p>
        {vote.myOptionId ? <p className="badge badge-green">Your vote: {vote.options.find((o: any) => o.id === vote.myOptionId)?.label}</p> : open ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{vote.options.map((o: any) => <button disabled={busy} className="btn-secondary" key={o.id} onClick={() => { if (window.confirm(`Cast your vote for “${o.label}”? You can vote only once.`)) void run(() => governanceApi.respond(vote.id, o.id), 'Your vote has been recorded.'); }}>{o.label}</button>)}</div> : <p>{vote.status === 'OPEN' && now < new Date(vote.opensAt).getTime() ? 'Voting has not started.' : 'Voting is closed.'}</p>}
        {vote.status === 'CLOSED' && <ul>{vote.options.map((o: any) => <li key={o.id}>{o.label}: {o._count?.responses ?? 0} votes</li>)}</ul>}
      </div><span className="badge badge-blue">{vote.status}</span></div>;
    })}{!loading && !votes.length && <EmptyState>No published votes for your cooperative.</EmptyState>}</div>
  </InsightPanel>;
}
