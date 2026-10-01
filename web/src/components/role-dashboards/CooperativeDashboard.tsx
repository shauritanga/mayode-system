'use client';
import { useAuthStore } from '@/store/auth.store';
import { SecretaryDashboard } from './SecretaryDashboard';
import FieldOfficerDashboard from '@/screens/dashboard/field-officer/page';

export default function CooperativeDashboard() {
  const role = useAuthStore((state) => state.user?.role);
  return role === 'FIELD_OFFICER' ? <FieldOfficerDashboard /> : <SecretaryDashboard />;
}
