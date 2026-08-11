'use client';
import { InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { membershipsApi } from '@/lib/api';
import { MembershipForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerMembershipPage() {
  const { membership, plans, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="Membership status" subtitle="Premium access unlocks deeper recommendations and services.">
      <div className="role-list">
        <div className="role-list-item"><strong>Active</strong><span className={`badge ${membership?.active ? 'badge-green' : 'badge-gold'}`}>{membership?.active ? 'Yes' : 'No'}</span></div>
        <div className="role-list-item"><strong>Latest status</strong><span>{membership?.latest?.status || 'No membership yet'}</span></div>
        <div className="role-list-item"><strong>Payment status</strong><span>{membership?.latest?.paymentStatus || '—'}</span></div>
      </div>
    </InsightPanel>
    <MembershipForm plans={plans} onStart={(payload) => run(() => membershipsApi.start(payload), 'Membership payment started/submitted.')} onReconcile={() => run(() => membershipsApi.reconcile(), 'Membership payment status refreshed.')} />
  </div>;
}
