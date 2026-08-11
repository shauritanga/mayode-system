'use client';
import { InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { farmersApi } from '@/lib/api';
import { ConsentForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerConsentPage() {
  const { farmer, profile, consents, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="Consent records" subtitle="Formal data sharing and privacy records.">
      <div className="role-list">
        <div className="role-list-item"><strong>Financial provider sharing</strong><span className={`badge ${profile?.consent?.financialProviderSharing ? 'badge-green' : 'badge-gold'}`}>{profile?.consent?.financialProviderSharing ? 'Allowed' : 'Not shared'}</span></div>
        {consents.map((record) => <div className="role-list-item" key={record.id}><div><strong>{record.scope}</strong><p>{record.formVersion} · {record.language}</p></div><small>{new Date(record.capturedAt).toLocaleDateString()}</small></div>)}
      </div>
    </InsightPanel>
    <ConsentForm onSubmit={(payload) => run(() => farmersApi.captureConsent(farmer.id, payload), 'Consent record captured.')} />
  </div>;
}
