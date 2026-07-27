'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Notification03Icon, Sun01Icon, Moon02Icon } from '@hugeicons/core-free-icons';
import { notificationsApi } from '@/lib/api';
import { useThemeStore } from '@/store/theme.store';
import UserMenu from './UserMenu';

interface Notification {
  id: string;
  title: string;
  body?: string;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Header() {
  const { theme, toggleTheme } = useThemeStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadUnreadCount = useCallback(() => {
    notificationsApi.unreadCount().then((res) => setUnreadCount(res.data?.count ?? 0)).catch(() => {});
  }, []);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openPanel = () => {
    setOpen((o) => !o);
    if (!open) {
      notificationsApi.list().then((res) => setNotifications(res.data ?? [])).catch(() => {});
    }
  };

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotifications((n) => n.map((x) => ({ ...x, isRead: true })));
    setUnreadCount(0);
  };

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, isRead: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  return (
    <header className="top-header">
      <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        <HugeiconsIcon icon={theme === 'dark' ? Sun01Icon : Moon02Icon} size={18} strokeWidth={1.8} />
      </button>

      <div ref={ref} style={{ position: 'relative' }}>
        <button className="icon-btn" onClick={openPanel} title="Notifications">
          <HugeiconsIcon icon={Notification03Icon} size={18} strokeWidth={1.8} />
          {unreadCount > 0 && <span className="icon-btn-dot" />}
        </button>

        {open && (
          <div className="dropdown-menu" style={{ top: 'calc(100% + 10px)', right: 0, width: '340px', maxHeight: '420px', overflowY: 'auto', padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markRead(n.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    background: n.isRead ? 'transparent' : 'rgba(16, 185, 129, 0.06)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: n.isRead ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {!n.isRead && <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: 'var(--accent)', marginTop: '5px', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</div>
                      {!!n.body && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{n.body}</div>}
                      <div style={{ fontSize: '11px', color: 'var(--neutral-500)', marginTop: '4px' }}>{timeAgo(n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

      <UserMenu variant="header" />
    </header>
  );
}
