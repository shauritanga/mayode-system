'use client';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import { farmAlertsApi, rewardsApi } from '@/lib/api';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerAlertsPage() {
  const { alerts, rewards, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="Alerts and recommendations" subtitle="Rule-based farm reminders and action prompts.">
      <div className="role-list">
        {alerts.map((alert) => <div className="role-list-item" key={alert.id}>
          <div><strong>{alert.title}</strong><p>{alert.message || alert.recommendation || 'Review this alert.'}</p></div>
          <button className="btn-secondary" onClick={() => run(() => farmAlertsApi.complete(alert.id), 'Alert marked complete.')}>Complete</button>
        </div>)}
        {!alerts.length && <EmptyState>No alerts right now.</EmptyState>}
      </div>
    </InsightPanel>
    <InsightPanel title="Rewards" subtitle="Farmer incentives and confirmed prizes.">
      <div className="role-list">
        {rewards.map((reward) => <div className="role-list-item" key={reward.id}>
          <div><strong>{reward.campaign?.name || reward.rewardName || 'Reward'}</strong><p>{reward.status || 'Announced'}</p></div>
          <button className="btn-secondary" onClick={() => run(() => rewardsApi.confirmReceipt(reward.id), 'Reward receipt confirmed.')}>Confirm receipt</button>
        </div>)}
        {!rewards.length && <EmptyState>No rewards announced for you yet.</EmptyState>}
      </div>
    </InsightPanel>
  </div>;
}
