'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { UserIcon, Logout01Icon, ChevronDownIcon } from '@hugeicons/core-free-icons';
import { useAuthStore } from '@/store/auth.store';

function initials(firstName?: string, lastName?: string, phone?: string): string {
  if (firstName || lastName) {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
  }
  return phone?.slice(-2) ?? '?';
}

/**
 * Avatar + dropdown (Profile / Logout), shared between the sticky header (compact)
 * and the sidebar footer (full name + role visible). Click-outside and Escape close it.
 */
export default function UserMenu({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : (user?.phone ?? 'Account');
  const initialsText = initials(user?.firstName, user?.lastName, user?.phone);

  const avatarSize = variant === 'header' ? 36 : 40;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: variant === 'sidebar' ? 'var(--surface-2)' : 'transparent',
          border: variant === 'sidebar' ? '1px solid var(--border)' : '1px solid transparent',
          borderRadius: variant === 'sidebar' ? '12px' : '10px',
          padding: variant === 'sidebar' ? '8px 10px' : '4px 8px 4px 4px',
          cursor: 'pointer',
          width: variant === 'sidebar' ? '100%' : 'auto',
          transition: 'all 0.15s ease',
        }}
      >
        <span
          className="avatar-circle"
          style={{ width: avatarSize, height: avatarSize, fontSize: variant === 'header' ? '13px' : '14px' }}
        >
          {initialsText}
        </span>
        {variant === 'sidebar' && (
          <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{user?.role}</div>
          </span>
        )}
        <HugeiconsIcon icon={ChevronDownIcon} size={14} color="var(--text-secondary)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div
          className="dropdown-menu"
          style={
            variant === 'sidebar'
              ? { bottom: 'calc(100% + 8px)', left: 0, right: 0 }
              : { top: 'calc(100% + 10px)', right: 0 }
          }
        >
          <div style={{ padding: '8px 10px 10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{user?.role}</div>
          </div>
          <div className="dropdown-divider" />
          <Link href="/dashboard/profile" className="dropdown-item" onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={UserIcon} size={16} strokeWidth={2} />
            Profile
          </Link>
          <div className="dropdown-divider" />
          <button className="dropdown-item danger" onClick={handleLogout}>
            <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={2} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
