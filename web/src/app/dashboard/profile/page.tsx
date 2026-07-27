'use client';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Logout01Icon, UserIcon, CallIcon, IdIcon } from '@hugeicons/core-free-icons';
import { useAuthStore } from '@/store/auth.store';

function initials(firstName?: string, lastName?: string, phone?: string): string {
  if (firstName || lastName) {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
  }
  return phone?.slice(-2) ?? '?';
}

export default function ProfilePage() {
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : (user?.phone ?? 'Account');

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--green-500), var(--green-400))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Profile</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Your account details</p>
      </div>

      <div className="glass-card" style={{ padding: '28px', maxWidth: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <span className="avatar-circle" style={{ width: 64, height: 64, fontSize: '22px' }}>
            {initials(user?.firstName, user?.lastName, user?.phone)}
          </span>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>{displayName}</div>
            <span className="badge badge-green" style={{ marginTop: '6px' }}>{user?.role}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <ProfileRow icon={CallIcon} label="Phone number" value={user?.phone ?? '—'} />
          <ProfileRow icon={UserIcon} label="First name" value={user?.firstName ?? '—'} />
          <ProfileRow icon={UserIcon} label="Last name" value={user?.lastName ?? '—'} />
          <ProfileRow icon={IdIcon} label="Role" value={user?.role ?? '—'} />
        </div>

        <button
          className="btn-secondary"
          onClick={handleLogout}
          style={{ width: '100%', marginTop: '24px', color: 'var(--red-400)', borderColor: 'var(--red-400)' }}
        >
          <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={2} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function ProfileRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: '10px' }}>
      <HugeiconsIcon icon={icon} size={16} color="var(--accent)" strokeWidth={2} />
      <div>
        <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{label}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}
