'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import UserMenu from './UserMenu';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { getVisibleGroups } from '@/lib/nav';

function NavList({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const reduce = useReducedMotion();

  const visibleGroups = getVisibleGroups(user);

  return (
    <nav className="sidebar-nav">
      {visibleGroups.map((group) => (
        <div key={group.label || 'admin-flat'} className="sidebar-group">
          {group.label && <div className="sidebar-group-label">{group.label}</div>}
          {group.items.map((item) => {
            // Landing pages that sit at the same path prefix as their own sibling
            // routes must match exactly, not by prefix — otherwise the landing
            // page's nav item stays highlighted on every sub-page too.
            const isLandingPage = item.href === '/dashboard' || item.href === '/dashboard/farmer';
            const isActive = pathname === item.href || (!isLandingPage && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId={reduce ? undefined : 'sidebar-active-pill'}
                    className="sidebar-active-pill"
                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  />
                )}
                <span className="sidebar-link-icon">
                  <HugeiconsIcon icon={item.icon} size={17} strokeWidth={1.8} />
                </span>
                <span className="sidebar-link-label" style={{ position: 'relative', zIndex: 1 }}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Logo() {
  return (
    <div className="sidebar-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/app-icon.png" alt="" className="sidebar-logo-icon" />
      <div className="sidebar-logo-text">
        <div className="sidebar-logo-name">MAYODE</div>
        <div className="sidebar-logo-sub">GROUP PLATFORM</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed } = useUiStore();
  const pathname = usePathname();
  const reduce = useReducedMotion();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen, setSidebarOpen]);

  return (
    <>
      {/* Desktop rail */}
      <aside className={`sidebar-desktop ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-inner">
          <Logo />
          <NavList collapsed={sidebarCollapsed} />
          <div className="sidebar-footer">
            <UserMenu variant="sidebar" collapsed={sidebarCollapsed} />
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="sidebar-drawer"
              initial={reduce ? { opacity: 0 } : { x: -280 }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="sidebar-inner">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                  <Logo />
                  <button className="icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                    <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
                  </button>
                </div>
                <NavList onNavigate={() => setSidebarOpen(false)} />
                <div className="sidebar-footer">
                  <UserMenu variant="sidebar" />
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
