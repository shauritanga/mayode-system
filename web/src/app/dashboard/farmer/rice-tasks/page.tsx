'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { riceProtocolsApi } from '@/lib/api';
import { TaskCompletionForm } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerRiceTasksPage() {
  const { cycleOptions, tasks, selectedCycleId, setSelectedCycleId, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="Mbalari rice calendar tasks" subtitle="Complete practical web tasks with measurements and evidence URLs.">
      <label className="form-label">Crop cycle<select className="input-field" value={selectedCycleId} onChange={(event) => setSelectedCycleId(event.target.value)}>
        <option value="">Select crop cycle</option>
        {cycleOptions.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.label}</option>)}
      </select></label>
      <div className="role-list" style={{ marginTop: 14 }}>
        {tasks.map((task) => <div className="role-list-item" key={task.id}>
          <div><strong>{task.title}</strong>{task.stageName && <span className="badge badge-blue" style={{ marginLeft: 8 }}>{task.stageName}</span>}<p>{task.guidance} · Due {new Date(task.dueDate).toLocaleDateString()}</p></div>
          <span className={`badge ${task.status === 'COMPLETED' ? 'badge-green' : 'badge-gold'}`}>{task.status}</span>
        </div>)}
        {!tasks.length && <EmptyState>No rice calendar tasks loaded for this cycle.</EmptyState>}
      </div>
    </InsightPanel>
    <TaskCompletionForm tasks={tasks.filter((task) => task.status !== 'COMPLETED')} onSubmit={(taskId, payload) => run(() => riceProtocolsApi.completeTask(taskId, payload), 'Rice calendar task completed.')} />
  </div>;
}
