'use client';
import Link from 'next/link';
import { getVisibleGroups } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';
import AdminOverviewDashboard from '@/components/role-dashboards/AdminOverviewDashboard';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  if (user?.role === 'SUPER_ADMIN') return <AdminOverviewDashboard />;
  const items = getVisibleGroups(user).flatMap((g) => g.items).filter((item) => item.href !== '/dashboard');
  return <div>
    <h1>{user?.customRoleName || 'Your workspace'}</h1>
    <p>Choose an area assigned to your role.</p>
    {items.length ? <div className="role-list">{items.map((item) => <Link className="quick-action" key={item.href} href={item.href}>{item.label}</Link>)}</div>
      : <p>No access has been assigned yet. Contact Super Admin.</p>}
  </div>;
}
