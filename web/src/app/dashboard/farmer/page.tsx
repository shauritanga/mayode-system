'use client';
import { EmptyState, InsightPanel, money } from '@/components/role-dashboards/DashboardPrimitives';
import { useFarmerData } from './FarmerDataContext';

export default function FarmerOverviewPage() {
  const { profile, activities, notifications } = useFarmerData();
  const payments = profile?.recentPayments || [];

  return <div className="role-two-col">
    <InsightPanel title="Recent activity" subtitle="Latest farm records and notifications.">
      <div className="role-list">
        {activities.slice(0, 6).map((activity) => <div className="role-list-item" key={activity.id}>
          <div><strong>{activity.activityType}</strong><p>{activity.description || 'No description'} · {new Date(activity.activityDate).toLocaleDateString()}</p></div>
          <span>{activity.cropCycle?.season || ''}</span>
        </div>)}
        {!activities.length && <EmptyState>No recent farming activities.</EmptyState>}
      </div>
    </InsightPanel>
    <InsightPanel title="Recent payments and messages" subtitle="Payment position and in-app notifications.">
      <div className="role-list">
        {payments.slice(0, 4).map((payment: any) => <div className="role-list-item" key={payment.id}>
          <div><strong>{money(payment.netAmount ?? payment.amount)}</strong><p>{payment.description || 'Farmer payment'} · {payment.status}</p></div>
          <small>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : 'Pending'}</small>
        </div>)}
        {notifications.slice(0, 4).map((item) => <div className="role-list-item" key={item.id}>
          <div><strong>{item.title}</strong><p>{item.message || item.body}</p></div>
          <span className={`badge ${item.isRead ? 'badge-blue' : 'badge-gold'}`}>{item.isRead ? 'Read' : 'New'}</span>
        </div>)}
        {!payments.length && !notifications.length && <EmptyState>No payment or notification records yet.</EmptyState>}
      </div>
    </InsightPanel>
  </div>;
}
