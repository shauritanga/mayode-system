'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Location01Icon,
  AlertCircleIcon,
  FileEditIcon,
  MapsSearchIcon,
  UserAdd01Icon,
  Shield01Icon,
  CloudSunRainIcon,
} from '@hugeicons/core-free-icons';
import UserMenu from './UserMenu';
import { useAuthStore } from '@/store/auth.store';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/farmer', label: 'Overview', icon: Home01Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/farms', label: 'My Farms', icon: Plant01Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/crop-cycles', label: 'Crop Cycles', icon: WheatIcon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/rice-tasks', label: 'Rice Tasks', icon: BookOpen01Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/finance', label: 'Finance', icon: Wallet01Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/membership', label: 'Membership', icon: StarIcon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/votes', label: 'Votes', icon: File01Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/alerts', label: 'Alerts', icon: BellIcon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/marketplace', label: 'Marketplace', icon: ShoppingCart02Icon, roles: ['FARMER'] },
  { href: '/dashboard/farmer/consent', label: 'Consent', icon: ClipboardIcon, roles: ['FARMER'] },
  { href: '/dashboard/field-officer', label: 'Field Dashboard', icon: MapsSearchIcon, roles: ['FIELD_OFFICER'] },
  { href: '/dashboard/auditor', label: 'Auditor Dashboard', icon: File01Icon, roles: ['AUDITOR'] },
  { href: '/dashboard/financial-provider', label: 'Credit Dashboard', icon: Wallet01Icon, roles: ['FINANCIAL_PROVIDER'] },
  { href: '/dashboard/leadership', label: 'Leadership', icon: DashboardSquare01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/staff', label: 'Staff', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/users', label: 'Users & Roles', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
  { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
  { href: '/dashboard/farm-registry', label: 'Farm Registry', icon: ClipboardIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
  { href: '/dashboard/seasons', label: 'Seasons', icon: Calendar01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/leases', label: 'Renter Assignments', icon: HandshakeIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/disputes', label: 'Disputes', icon: AlertCircleIcon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/corrections', label: 'Corrections', icon: FileEditIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/field-surveys', label: 'Field Surveys', icon: MapsSearchIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
  { href: '/dashboard/memberships', label: 'Memberships', icon: StarIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/alerts', label: 'Alerts', icon: BellIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/rewards', label: 'Rewards', icon: GiftIcon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/mamcos', label: 'AMCOS', icon: Building05Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/crop-cycles', label: 'Crop Cycles', icon: WheatIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
  { href: '/dashboard/activities', label: 'Crop Activities', icon: ClipboardIcon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'] },
  { href: '/dashboard/rice-calendar', label: 'Rice Calendar', icon: BookOpen01Icon, roles: ['MAMCOS_SECRETARY'] },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Package01Icon, roles: ['SUPER_ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/suppliers', label: 'Suppliers', icon: Package01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/sales', label: 'Cooperative Sales', icon: Wallet01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY', 'AUDITOR'] },
  { href: '/dashboard/weather', label: 'Weather', icon: CloudSunRainIcon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER'] },
  { href: '/dashboard/compliance', label: 'Compliance', icon: File01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY', 'AUDITOR'] },
  { href: '/dashboard/reports', label: 'Reports', icon: File01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY', 'AUDITOR'] },
  { href: '/dashboard/governance', label: 'Governance', icon: File01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/projects', label: 'Community Projects', icon: File01Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/buyer', label: 'Buyer Portal', icon: DashboardSquare01Icon, roles: ['BUYER'] },
  { href: '/dashboard/marketplace', label: 'M-LAX Marketplace', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/buyer-orders', label: 'Buyer Orders', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'] },
  { href: '/dashboard/locations', label: 'Locations', icon: Location01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/dashboard/settings', label: 'Settings', icon: DashboardSquare01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const visibleItems = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <aside style={{
      width: '240px',
      minHeight: '100vh',
      background: 'var(--neutral-900)',
      borderRight: '1px solid var(--neutral-800)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--neutral-800)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--green-800), var(--green-500))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: 'white', fontSize: '18px' }}>M</span>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.2 }}>MAYODE</div>
            <div style={{ fontSize: '10px', color: 'var(--neutral-500)', fontWeight: 500 }}>GROUP PLATFORM</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {visibleItems.map((item) => {
          // Landing pages that sit at the same path prefix as their own sibling routes
          // (e.g. "/dashboard/farmer" is the Overview page, but "/dashboard/farmer/farms"
          // etc. are siblings, not children of it) must match exactly, not by prefix —
          // otherwise the landing page's nav item stays highlighted on every sub-page too.
          const isLandingPage = item.href === '/dashboard' || item.href === '/dashboard/farmer';
          const isActive = pathname === item.href || (!isLandingPage && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <span style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.8} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User menu (avatar + name + role, opens Profile/Sign Out) */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--neutral-800)' }}>
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  );
}
