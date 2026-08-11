'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { governanceApi } from '@/lib/api';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerVotesPage() {
  const { votes, run } = useFarmerData();
  const openVotes = votes.filter((vote) => vote.status === 'OPEN');

  return <InsightPanel title="Member voting" subtitle="Open governance votes for cooperative decisions.">
    <div className="role-list">
      {openVotes.map((vote) => <div className="role-list-item" key={vote.id}>
        <div><strong>{vote.title}</strong><p>{vote.description || 'No description'}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{vote.options?.map((option: any) => <button key={option.id} className="btn-secondary" onClick={() => run(() => governanceApi.respond(vote.id, option.id), 'Vote recorded.')}>{option.label}</button>)}</div></div>
        <span className="badge badge-green">Open</span>
      </div>)}
      {!openVotes.length && <EmptyState>There are no open votes right now.</EmptyState>}
    </div>
  </InsightPanel>;
}
