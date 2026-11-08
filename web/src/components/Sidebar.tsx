'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import UserMenu from './UserMenu';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { APP_MODE, APP_MODE_LABEL } from '@/lib/app-mode';
import { getVisibleGroups } from '@/lib/nav';

type NavGroup = ReturnType<typeof getVisibleGroups>[number];
type NavItem = NavGroup['items'][number];

// Landing pages that sit at the same path prefix as their own sibling routes must match exactly, not by prefix,
// otherwise the landing page's nav item stays highlighted on every sub-page too.
// A farmer's profile opens from the Farmers tab of Farmers & Plot Allocation, so that item stays lit there.
const isItemActive = (pathname: string, item: NavItem) => {
  const isLandingPage = item.href === '/dashboard' || item.href === '/dashboard/farmer';
  return pathname === item.href || (!isLandingPage && pathname.startsWith(item.href))
    || (item.href === '/dashboard/plot-allocation' && pathname.startsWith('/dashboard/farmers/'));
};

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={item.href}
      id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`sidebar-link ${active ? 'active' : ''}`}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
    >
      {active && (
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
}

/** "More" button pinned to the bottom of the nav; opens a popover with the items that did not fit. */
function OverflowMenu({ entries, pathname, collapsed }: { entries: { item: NavItem; label?: string }[]; pathname: string; collapsed: boolean }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0, maxHeight: 400 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: collapsed ? r.right + 8 : r.left, bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(160, r.top - 16) });
    setShow(true);
  };

  useEffect(() => {
    if (!show) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setShow(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [show]);

  const anyActive = entries.some((e) => isItemActive(pathname, e.item));
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`sidebar-link sidebar-more ${show || anyActive ? 'active' : ''}`}
        onClick={() => (show ? setShow(false) : open())}
        aria-haspopup="menu"
        aria-expanded={show}
        title={collapsed ? 'More' : undefined}
        aria-label={collapsed ? 'More' : undefined}
      >
        <span className="sidebar-link-icon">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </span>
        <span className="sidebar-link-label">More</span>
      </button>
      {show && createPortal(
        <div ref={popRef} role="menu" className="sidebar-more-pop" style={{ left: pos.left, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
          {entries.map(({ item, label }) => (
            <div key={item.href}>
              {label && <div className="sidebar-group-label">{label}</div>}
              <Link
                href={item.href}
                role="menuitem"
                className={`sidebar-link ${isItemActive(pathname, item) ? 'active' : ''}`}
                onClick={() => setShow(false)}
              >
                <span className="sidebar-link-icon"><HugeiconsIcon icon={item.icon} size={17} strokeWidth={1.8} /></span>
                <span className="sidebar-link-label">{item.label}</span>
              </Link>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** AMCOS portal: nothing scrolls. What fits is shown, the rest moves into a "More" popover (as in rucky-rentals). */
function OverflowNavList({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed: boolean }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const groups = getVisibleGroups(user);
  // One flat entry per item; the first item of a group carries the group's label.
  const entries = groups.flatMap((g) => g.items.map((item, i) => ({ item, label: i === 0 ? g.label : undefined })));

  const navRef = useRef<HTMLElement>(null);
  const [overflowFrom, setOverflowFrom] = useState(Infinity);
  const MORE_BTN_H = 40;

  const measure = useCallback(() => {
    const nav = navRef.current;
    const wrap = nav?.querySelector<HTMLElement>('.sidebar-items');
    if (!nav || !wrap) return;
    const navH = nav.clientHeight;
    const kids = Array.from(wrap.children) as HTMLElement[];
    // Pass 1: does anything overflow the nav at all?
    if (!kids.some((k) => k.offsetTop + k.offsetHeight > navH)) { setOverflowFrom(kids.length); return; }
    // Pass 2: the first item that would sit under the "More" button.
    const safeH = navH - MORE_BTN_H;
    const first = kids.findIndex((k) => k.offsetTop + k.offsetHeight > safeH);
    setOverflowFrom(first === -1 ? kids.length : first);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (navRef.current) ro.observe(navRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, collapsed, entries.length]);

  return (
    <nav ref={navRef} className="sidebar-nav sidebar-nav-managed">
      <div className="sidebar-items">
        {entries.map(({ item, label }, i) => {
          const hidden = i >= overflowFrom;
          return (
            // Hidden items stay in the DOM so they can be measured, but are invisible and unreachable.
            <div key={item.href} className={label ? 'sidebar-group' : undefined} style={hidden ? { visibility: 'hidden' } : undefined} aria-hidden={hidden || undefined} inert={hidden || undefined}>
              {label && <div className="sidebar-group-label">{label}</div>}
              <NavLink item={item} active={isItemActive(pathname, item)} collapsed={collapsed} onNavigate={onNavigate} />
            </div>
          );
        })}
      </div>
      {overflowFrom < entries.length && <OverflowMenu entries={entries.slice(overflowFrom)} pathname={pathname} collapsed={collapsed} />}
    </nav>
  );
}

function NavList({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const visibleGroups = getVisibleGroups(user);
  if (APP_MODE === 'cooperatives') return <OverflowNavList onNavigate={onNavigate} collapsed={collapsed} />;

  return (
    <nav className="sidebar-nav">
      {visibleGroups.map((group) => (
        <div key={group.label || group.items[0]?.href || 'admin-flat'} className="sidebar-group">
          {group.label && <div className="sidebar-group-label">{group.label}</div>}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} active={isItemActive(pathname, item)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
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
        <div className="sidebar-logo-sub">{APP_MODE_LABEL[APP_MODE]}</div>
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
