'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { useFarmerData } from '../FarmerDataContext';

function ClaimTimeline({ claim }: { claim: any }) {
  const status = claim.status as string;
  const steps = [
    { key: 'SUBMITTED', label: 'Submitted', reached: true },
    {
      key: 'INSPECTING',
      label: 'Inspecting',
      reached: ['INSPECTING', 'APPROVED', 'REJECTED', 'PAID'].includes(status),
    },
    {
      key: 'DECISION',
      label: status === 'REJECTED' ? 'Rejected' : 'Approved',
      reached: ['APPROVED', 'REJECTED', 'PAID'].includes(status),
    },
    { key: 'PAID', label: 'Paid', reached: status === 'PAID' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {steps.map((step) => (
        <span
          key={step.key}
          className={`badge ${step.reached ? 'badge-green' : 'badge-gray'}`}
          style={{ fontSize: 11 }}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}

export default function FarmerInsurancePage() {
  const { policies } = useFarmerData();

  return (
    <InsightPanel
      title="Insurance policies and claims"
      subtitle="Coverage history for your farms and crop cycles, including claim status timeline."
    >
      <div className="role-list">
        {policies.map((policy: any) => (
          <div
            className="role-list-item"
            key={policy.id}
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div>
                <strong>{policy.productType?.replaceAll('_', ' ')}</strong>
                <p>
                  {policy.provider?.name || 'Insurer'} · Sum insured{' '}
                  {Number(policy.sumInsured).toLocaleString()} · Premium{' '}
                  {Number(policy.premiumAmount).toLocaleString()}
                </p>
              </div>
              <span
                className={`badge ${
                  policy.status === 'ACTIVE'
                    ? 'badge-green'
                    : policy.status === 'PENDING'
                      ? 'badge-gold'
                      : 'badge-red'
                }`}
              >
                {policy.status}
              </span>
            </div>
            {!!policy.claims?.length && (
              <div className="role-list" style={{ marginLeft: 12 }}>
                {policy.claims.map((claim: any) => (
                  <div
                    className="role-list-item"
                    key={claim.id}
                    style={{ flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <div>
                        <strong>
                          Claim · {claim.incidentType}
                        </strong>
                        <p>
                          {claim.description || 'No description'} · Claimed{' '}
                          {Number(claim.claimedAmount).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`badge ${
                          claim.status === 'PAID'
                            ? 'badge-green'
                            : claim.status === 'REJECTED'
                              ? 'badge-red'
                              : 'badge-gold'
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>
                    <ClaimTimeline claim={claim} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!policies.length && <EmptyState>No insurance policies on record yet.</EmptyState>}
      </div>
    </InsightPanel>
  );
}
