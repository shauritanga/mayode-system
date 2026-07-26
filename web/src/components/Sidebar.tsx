'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Package01Icon,
  Wallet01Icon,
  ShoppingCart02Icon,
  Location01Icon,
} from '@hugeicons/core-free-icons';
import { useAuthStore } from '@/store/auth.store';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home01Icon },
  { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon },
  { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon },
  { href: '/dashboard/farm-registry', label: 'Farm Registry', icon: ClipboardIcon },
  { href: '/dashboard/seasons', label: 'Seasons', icon: Calendar01Icon },
  { href: '/dashboard/leases', label: 'Leases', icon: HandshakeIcon },
  { href: '/dashboard/memberships', label: 'Memberships', icon: StarIcon },
  { href: '/dashboard/alerts', label: 'Alerts', icon: BellIcon },
  { href: '/dashboard/rewards', label: 'Rewards', icon: GiftIcon },
  { href: '/dashboard/mamcos', label: 'AMCOS', icon: Building05Icon },
  { href: '/dashboard/crop-cycles', label: 'Crop Cycles', icon: WheatIcon },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Package01Icon },
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet01Icon },
  { href: '/dashboard/marketplace', label: 'M-LAX Marketplace', icon: ShoppingCart02Icon },
  { href: '/dashboard/locations', label: 'Locations', icon: Location01Icon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

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
            background: 'linear-gradient(135deg, #065F46, #10B981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: 'white', fontSize: '18px' }}>M</span>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '15px', color: '#F9FAFB', lineHeight: 1.2 }}>MAYODE</div>
            <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: 500 }}>GROUP PLATFORM</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
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

      {/* User & Logout */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--neutral-800)' }}>
        {user && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--neutral-800)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#F9FAFB', marginBottom: '2px' }}>
              {user.firstName ? `${user.firstName} ${user.lastName}` : user.phone}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280' }}>{user.role}</div>
          </div>
        )}
        <button
          id="logout-btn"
          onClick={handleLogout}
          className="btn-secondary"
          style={{ width: '100%', fontSize: '13px', padding: '8px 12px' }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
