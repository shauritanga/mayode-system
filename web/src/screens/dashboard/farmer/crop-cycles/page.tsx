'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { cropCyclesApi } from '@/lib/api';
import { CropCycleForm, ActivityForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerCropCyclesPage() {
  const { farms, cycles, cycleOptions, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="Crop cycles" subtitle="Seasonal rice production records.">
      <div className="role-list">
        {cycleOptions.map((cycle) => <div className="role-list-item" key={cycle.id}>
          <div><strong>{cycle.season}</strong><p>{cycle.riceVariety || 'Variety missing'} · {cycle.label}</p></div>
          <span className="badge badge-blue">{cycle.status}</span>
        </div>)}
        {!cycles.length && <EmptyState>No crop cycles yet.</EmptyState>}
      </div>
    </InsightPanel>
    <CropCycleForm farms={farms} onSubmit={(payload) => run(() => cropCyclesApi.create(payload), 'Crop cycle created.')} />
    <ActivityForm cycles={cycleOptions} onSubmit={(payload) => run(() => cropCyclesApi.logActivity(payload), 'Activity logged.')} />
  </div>;
}
