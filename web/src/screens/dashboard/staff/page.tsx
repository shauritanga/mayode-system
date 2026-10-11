'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { mamcosApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { apiErrorMessage } from '@/lib/api-error';

interface Secretary { firstName: string; lastName: string; user?: { phone: string } }
interface OfficerRow {
  id: string; employeeCode: string; firstName: string; lastName: string;
  assignedArea?: string; user?: { phone: string; isActive: boolean };
}

export default function StaffPage() {
  const [mamcosName, setMamcosName] = useState('');
  const [secretary, setSecretary] = useState<Secretary | null>(null);
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((st) => st.user);
  const canAddStaff = !!user?.mamcosId && hasPermission(user, 'users', 'CREATE');
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    mamcosApi.dashboard()
      .then(res => {
        const secretaryRow = res.data;
        const m = secretaryRow?.mamcos;
        setMamcosName(m?.name || '');
        setSecretary(secretaryRow ? { firstName: secretaryRow.firstName, lastName: secretaryRow.lastName, user: secretaryRow.user } : null);
        setOfficers(m?.fieldOfficers ?? []);
      })
      .catch((e) => setMessage(apiErrorMessage(e, 'Could not load staff.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--gold-400), var(--gold-300))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Staff</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>{mamcosName || 'Your AMCOS'} — leader and field officers</p>
        </div>
        {canAddStaff && <Link href="/dashboard/users" className="btn-primary" style={{ textDecoration: 'none' }}>Add staff in User Accounts</Link>}
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)' }}>{message}</div>}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading staff…</div>
      ) : (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {secretary && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface-tint)', borderRadius: '10px' }}>
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>🧑‍💼</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{secretary.firstName} {secretary.lastName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>AMCOS Leader (you) · {secretary.user?.phone || '—'}</div>
                </div>
              </div>
            )}
            {officers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--neutral-600)', fontSize: '14px', padding: '24px 0' }}>
                No field officers yet. Add one in User Accounts with the “Field officer” account type.
              </div>
            ) : officers.map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface-tint)', borderRadius: '10px' }}>
                <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>🧑‍🌾</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.firstName} {o.lastName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>
                    {o.employeeCode} · {o.user?.phone || 'No phone'}{o.assignedArea ? ` · ${o.assignedArea}` : ''}
                  </div>
                </div>
                <span className={`badge ${o.user?.isActive !== false ? 'badge-green' : 'badge-gray'}`}>
                  {o.user?.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
