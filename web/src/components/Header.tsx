'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Notification03Icon, Sun01Icon, Moon02Icon, Menu02Icon, PanelLeftCloseIcon, PanelLeftOpenIcon } from '@hugeicons/core-free-icons';
import { notificationsApi } from '@/lib/api';
import { useThemeStore } from '@/store/theme.store';
import { useUiStore } from '@/store/ui.store';
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

const TITLE_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  farmer: 'Farmer Workspace',
  farms: 'Farms',
  farmers: 'Farmers',
  'farm-registry': 'Farm Registry',
  'crop-cycles': 'Crop Cycles',
  'rice-tasks': 'Rice Tasks',
  'field-officer': 'Field Dashboard',
  'field-surveys': 'Field Surveys',
  auditor: 'Auditor Dashboard',
  'financial-provider': 'Credit Dashboard',
  buyer: 'Buyer Portal',
  'buyer-orders': 'Buyer Orders',
  leadership: 'Leadership',
  staff: 'Staff',
  users: 'Users & Roles',
  seasons: 'Seasons',
  leases: 'Renter Assignments',
  disputes: 'Disputes',
  corrections: 'Corrections',
  memberships: 'Memberships',
  membership: 'Membership',
  alerts: 'Alerts',
  rewards: 'Rewards',
  mamcos: 'AMCOS',
  activities: 'Crop Activities',
  'rice-calendar': 'Rice Calendar',
  inventory: 'Inventory',
  suppliers: 'Suppliers',
  sales: 'Cooperative Sales',
  finance: 'Finance',
  insurance: 'Insurance',
  weather: 'Weather',
  compliance: 'Compliance',
  reports: 'Reports',
  governance: 'Governance',
  projects: 'Community Projects',
  marketplace: 'M-LAX Marketplace',
  locations: 'Locations',
  settings: 'Settings',
  profile: 'Profile',
  votes: 'Votes',
  consent: 'Consent',
};

function pageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || last === 'dashboard') return 'Dashboard';
  return TITLE_MAP[last] ?? last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Header() {
  const { theme, toggleTheme } = useThemeStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed);
  const pathname = usePathname();
  const reduce = useReducedMotion();
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
      <button className="icon-btn header-menu-btn" onClick={toggleSidebar} aria-label="Open menu">
        <HugeiconsIcon icon={Menu02Icon} size={19} strokeWidth={1.8} />
      </button>

      <button
        className="icon-btn header-collapse-btn"
        onClick={toggleCollapsed}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!sidebarCollapsed}
      >
        <motion.span
          key={sidebarCollapsed ? 'collapsed' : 'expanded'}
          initial={reduce ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          style={{ display: 'inline-flex' }}
        >
          <HugeiconsIcon icon={sidebarCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} size={19} strokeWidth={1.8} />
        </motion.span>
      </button>

      <AnimatePresence mode="wait" initial={false}>
        <motion.h1
          key={pathname}
          className="header-title"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {pageTitle(pathname)}
        </motion.h1>
      </AnimatePresence>

      <div style={{ flex: 1 }} />

      <button
        className="icon-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle theme"
      >
        <motion.span
          key={theme}
          initial={reduce ? false : { rotate: -70, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          style={{ display: 'inline-flex' }}
        >
          <HugeiconsIcon icon={theme === 'dark' ? Sun01Icon : Moon02Icon} size={18} strokeWidth={1.8} />
        </motion.span>
      </button>

      <div ref={ref} style={{ position: 'relative' }}>
        <button className="icon-btn" onClick={openPanel} title="Notifications" aria-label="Notifications">
          <HugeiconsIcon icon={Notification03Icon} size={18} strokeWidth={1.8} />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                className="icon-btn-dot"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              />
            )}
          </AnimatePresence>
        </button>

        {open && (
          <div className="dropdown-menu" style={{ top: 'calc(100% + 10px)', right: 0, width: 'min(360px, calc(100vw - 32px))', maxHeight: '420px', overflowY: 'auto', padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-1)' }}>Notifications</span>
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
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: '13px' }}>
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
                    background: n.isRead ? 'transparent' : 'var(--accent-softer)',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: n.isRead ? 'default' : 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {!n.isRead && <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: 'var(--accent)', marginTop: '5px', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>{n.title}</div>
                      {!!n.body && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>{n.body}</div>}
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{timeAgo(n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '22px', background: 'var(--border-strong)', margin: '0 4px' }} />

      <UserMenu variant="header" />
    </header>
  );
}
