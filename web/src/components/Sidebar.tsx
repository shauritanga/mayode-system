'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Home01Icon,
  UserGroupIcon,
  Plant01Icon,
  ClipboardIcon,
  Calendar01Icon,
  HandshakeIcon,
  StarIcon,
  BellIcon,
  GiftIcon,
  Building05Icon,
  WheatIcon,
  BookOpen01Icon,
  Package01Icon,
  Wallet01Icon,
  File01Icon,
  DashboardSquare01Icon,
  ShoppingCart02Icon,
  AlertCircleIcon,
  FileEditIcon,
  MapsSearchIcon,
  UserAdd01Icon,
  Shield01Icon,
  CloudSunRainIcon,
  Cancel01Icon,
  ChartBarLineIcon,
  Store01Icon,
} from '@hugeicons/core-free-icons';
import UserMenu from './UserMenu';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';

type IconData = typeof Home01Icon;

interface NavItem {
  href: string;
  label: string;
  icon: IconData;
  roles: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/mamcos', label: 'AMCOS', icon: Building05Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/memberships', label: 'Membership', icon: StarIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Package01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/marketplace', label: 'MLAX', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/finance', label: 'Finance and Accounting', icon: Wallet01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/reports', label: 'Reports', icon: ChartBarLineIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/users', label: 'User Accounts', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/roles', label: 'Roles & Permissions', icon: Shield01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/staff-management', label: 'Create Staff', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/ai', label: 'AI Insights', icon: ChartBarLineIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/farmer', label: 'Overview', icon: Home01Icon, roles: ['FARMER'] },
      { href: '/dashboard/field-officer', label: 'Field Dashboard', icon: MapsSearchIcon, roles: ['FIELD_OFFICER'] },
      { href: '/dashboard/auditor', label: 'Auditor Dashboard', icon: File01Icon, roles: ['AUDITOR'] },
      { href: '/dashboard/financial-provider', label: 'Credit Dashboard', icon: Wallet01Icon, roles: ['FINANCIAL_PROVIDER'] },
      { href: '/dashboard/buyer', label: 'Buyer Portal', icon: DashboardSquare01Icon, roles: ['BUYER'] },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/dashboard/leadership', label: 'Leadership', icon: DashboardSquare01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/staff', label: 'Staff', icon: UserAdd01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
      { href: '/dashboard/memberships', label: 'Memberships', icon: StarIcon, roles: ['MAMCOS_SECRETARY'] },
    ],
  },
  {
    label: 'Field Operations',
    items: [
      { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
      { href: '/dashboard/farm-registry', label: 'Farm Registry', icon: ClipboardIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
      { href: '/dashboard/field-surveys', label: 'Field Surveys', icon: MapsSearchIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
      { href: '/dashboard/crop-cycles', label: 'Crop Cycles', icon: WheatIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
      { href: '/dashboard/activities', label: 'Crop Activities', icon: ClipboardIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
      { href: '/dashboard/rice-calendar', label: 'Rice Calendar', icon: BookOpen01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/seasons', label: 'Seasons', icon: Calendar01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/leases', label: 'Renter Assignments', icon: HandshakeIcon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/weather', label: 'Weather', icon: CloudSunRainIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/dashboard/inventory', label: 'Inventory', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/traceability', label: 'Traceability', icon: MapsSearchIcon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'] },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/sales', label: 'Cooperative Sales', icon: Wallet01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'] },
      { href: '/dashboard/buyer-orders', label: 'Buyer Orders', icon: Store01Icon, roles: ['MAMCOS_SECRETARY'] },
    ],
  },
  {
    label: 'Governance & Insights',
    items: [
      { href: '/dashboard/disputes', label: 'Disputes', icon: AlertCircleIcon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/corrections', label: 'Corrections', icon: FileEditIcon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/compliance', label: 'Compliance', icon: File01Icon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'] },
      { href: '/dashboard/reports', label: 'Reports', icon: ChartBarLineIcon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'] },
      { href: '/dashboard/grantor', label: 'Grantor Impact', icon: ChartBarLineIcon, roles: ['AUDITOR', 'BUYER'] },
      { href: '/dashboard/ai', label: 'AI Insights', icon: ChartBarLineIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
      { href: '/dashboard/governance', label: 'Governance', icon: File01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/projects', label: 'Community Projects', icon: GiftIcon, roles: ['MAMCOS_SECRETARY'] },
    ],
  },
  {
    label: 'My Farm',
    items: [
      { href: '/dashboard/farmer/farms', label: 'My Farms', icon: Plant01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/crop-cycles', label: 'Crop Cycles', icon: WheatIcon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/rice-tasks', label: 'Rice Tasks', icon: BookOpen01Icon, roles: ['FARMER'] },
    ],
  },
  {
    label: 'Services',
    items: [
      { href: '/dashboard/farmer/finance', label: 'Finance', icon: Wallet01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/membership', label: 'Membership', icon: StarIcon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/votes', label: 'Votes', icon: File01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/alerts', label: 'Alerts', icon: BellIcon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/marketplace', label: 'Marketplace', icon: ShoppingCart02Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/consent', label: 'Consent', icon: ClipboardIcon, roles: ['FARMER'] },
    ],
  },
];

function NavList({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const reduce = useReducedMotion();

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => role && item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

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
