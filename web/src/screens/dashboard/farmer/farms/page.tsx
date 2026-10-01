'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { farmsApi, registryApi } from '@/lib/api';
import { FarmForm, FarmEvidenceForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerFarmsPage() {
  const { farmer, farms, registryRecords, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="My farms" subtitle="View farms and add browser-upload/manual evidence.">
      <div className="role-list">
        {farms.map((farm) => <div className="role-list-item" key={farm.id}>
          <div><strong>{farm.farmCode}</strong><p>{farm.name} · {farm.socialHectares} ha · {farm.village || 'Village missing'}</p></div>
          <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>{farm.isVerified ? 'Verified' : 'Pending'}</span>
        </div>)}
        {!farms.length && <EmptyState>No farms registered yet.</EmptyState>}
      </div>
    </InsightPanel>
    <FarmForm farmer={farmer} onSubmit={(payload) => run(() => farmsApi.create(payload), 'Farm submitted for registration.')} />
    <FarmEvidenceForm farms={farms} onSubmit={(farmId, payload) => run(() => farmsApi.addPhoto(farmId, payload), 'Farm photo/evidence added.')} />
    <InsightPanel title="Claim pre-registered farms" subtitle="AMCOS-created records waiting for owner confirmation.">
      <div className="role-list">
        {registryRecords.map((record) => <div className="role-list-item" key={record.id}>
          <div><strong>{record.farmCode || record.name}</strong><p>{record.village || 'Location pending'} · {record.status}</p></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="btn-secondary" onClick={() => run(() => registryApi.claim(record.id), 'Farm claim submitted.')}>Claim</button><button className="btn-secondary" onClick={() => run(() => registryApi.reject(record.id), 'Farm claim rejected.')}>Reject</button></div>
        </div>)}
        {!registryRecords.length && <EmptyState>No farm claims waiting.</EmptyState>}
      </div>
    </InsightPanel>
  </div>;
}
