'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerInsurancePage() {
  const { policies } = useFarmerData();

  return <InsightPanel title="Insurance policies and claims" subtitle="Coverage history for your farms and crop cycles.">
    <div className="role-list">
      {policies.map((policy: any) => <div className="role-list-item" key={policy.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div><strong>{policy.productType?.replaceAll('_', ' ')}</strong><p>{policy.provider?.name || 'Insurer'} · Sum insured {policy.sumInsured} · Premium {policy.premiumAmount}</p></div>
          <span className={`badge ${policy.status === 'ACTIVE' ? 'badge-green' : policy.status === 'PENDING' ? 'badge-gold' : 'badge-red'}`}>{policy.status}</span>
        </div>
        {!!policy.claims?.length && <div className="role-list" style={{ marginLeft: 12 }}>
          {policy.claims.map((claim: any) => <div className="role-list-item" key={claim.id}>
            <div><strong>Claim · {claim.incidentType}</strong><p>{claim.description || 'No description'} · Claimed {claim.claimedAmount}</p></div>
            <span className={`badge ${claim.status === 'PAID' ? 'badge-green' : claim.status === 'REJECTED' ? 'badge-red' : 'badge-gold'}`}>{claim.status}</span>
          </div>)}
        </div>}
      </div>)}
      {!policies.length && <EmptyState>No insurance policies on record yet.</EmptyState>}
    </div>
  </InsightPanel>;
}
