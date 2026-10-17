'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { useFarmerData } from '../FarmerDataContext';
import InsuranceApplicationsPanel from '@/components/insurance/InsuranceApplicationsPanel';
import ProductGuide from '@/components/insurance/ProductGuide';

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
    <>
    <InsightPanel
      title="Apply for crop insurance"
      subtitle="Choose a cover, see the risk and a suggested amount, and send it to an insurance company. Cover starts when your premium is paid at the cooperative office."
    >
      <InsuranceApplicationsPanel mode="farmer" canApply />
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>What each cover means</summary>
        <div style={{ marginTop: 10 }}><ProductGuide /></div>
      </details>
    </InsightPanel>
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
                          {claim.approvedAmount != null && <> · Approved {Number(claim.approvedAmount).toLocaleString()}</>}
                          {claim.paidAmount ? <> · Paid {Number(claim.paidAmount).toLocaleString()}</> : null}
                        </p>
                        {claim.decisionNote && <p>Insurer’s note: {claim.decisionNote}</p>}
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
    </>
  );
}
