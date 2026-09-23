'use client';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { landingFor } from '@/lib/nav';

export default function ForbiddenPage() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div className="page-shell">
      <div
        className="glass-card"
        style={{
          maxWidth: 520,
          margin: '48px auto',
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--red-400)',
            marginBottom: '8px',
          }}
        >
          403 — NOT AUTHORIZED
        </div>
        <h1
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          You don&apos;t have access to this section
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginBottom: '24px' }}>
          Your account
          {role ? (
            <>
              {' '}(<strong>{role.replace(/_/g, ' ')}</strong>)
            </>
          ) : null}{' '}
          isn&apos;t permitted to view this page. If you need access, ask your
          administrator to update your role.
        </p>
        <Link href={landingFor(role)} className="btn-primary">
          Back to my dashboard
        </Link>
      </div>
    </div>
  );
}
