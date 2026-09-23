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
  ChartBarLineIcon,
  Store01Icon,
} from '@hugeicons/core-free-icons';

export type IconData = typeof Home01Icon;

export interface NavItem {
  href: string;
  label: string;
  icon: IconData;
  roles: string[];
  /**
   * Permission-catalog resource key guarding this section (mirrors the
   * backend `@RequirePermission('<resource>', 'VIEW')` on the matching
   * controller). Undefined = reserved for built-in navigation.
   */
  resource?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home01Icon, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'farmers' },
      { href: '/dashboard/mamcos', label: 'AMCOS', icon: Building05Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'mamcos' },
      { href: '/dashboard/memberships', label: 'Membership', icon: StarIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'memberships' },
      { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'farms' },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Package01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'inventory' },
      { href: '/dashboard/marketplace', label: 'MLAX', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'marketplace' },
      { href: '/dashboard/finance', label: 'Finance and Accounting', icon: Wallet01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'finance' },
      { href: '/dashboard/reports', label: 'Reports', icon: ChartBarLineIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'reports' },
      { href: '/dashboard/users', label: 'User Accounts', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'users' },
      { href: '/dashboard/roles', label: 'Roles & Permissions', icon: Shield01Icon, roles: ['SUPER_ADMIN'] },
      { href: '/dashboard/ai', label: 'AI Insights', icon: ChartBarLineIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'ai_insights' },
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
      { href: '/dashboard/leadership', label: 'Leadership', icon: DashboardSquare01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'governance' },
      { href: '/dashboard/staff', label: 'Staff', icon: UserAdd01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'users' },
      { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'], resource: 'farmers' },
      { href: '/dashboard/memberships', label: 'Memberships', icon: StarIcon, roles: ['MAMCOS_SECRETARY'], resource: 'memberships' },
    ],
  },
  {
    label: 'Field Operations',
    items: [
      { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'], resource: 'farms' },
      { href: '/dashboard/farm-registry', label: 'Farm Registry', icon: ClipboardIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'], resource: 'farm_registry' },
      { href: '/dashboard/field-surveys', label: 'Field Surveys', icon: MapsSearchIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'], resource: 'field_surveys' },
      { href: '/dashboard/crop-cycles', label: 'Crop Cycles', icon: WheatIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'], resource: 'crop_cycles' },
      { href: '/dashboard/activities', label: 'Crop Activities', icon: ClipboardIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'], resource: 'activities' },
      { href: '/dashboard/rice-calendar', label: 'Rice Calendar', icon: BookOpen01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'rice_protocols' },
      { href: '/dashboard/seasons', label: 'Seasons', icon: Calendar01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'farming_seasons' },
      { href: '/dashboard/leases', label: 'Renter Assignments', icon: HandshakeIcon, roles: ['MAMCOS_SECRETARY'], resource: 'farm_leases' },
      { href: '/dashboard/weather', label: 'Weather', icon: CloudSunRainIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'], resource: 'weather' },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/dashboard/inventory', label: 'Inventory', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'inventory' },
      { href: '/dashboard/traceability', label: 'Traceability', icon: MapsSearchIcon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'sales' },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'suppliers' },
      { href: '/dashboard/sales', label: 'Cooperative Sales', icon: Wallet01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'sales' },
      { href: '/dashboard/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'insurance' },
      { href: '/dashboard/buyer-orders', label: 'Buyer Orders', icon: Store01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'buyer_orders' },
    ],
  },
  {
    label: 'Governance & Insights',
    items: [
      { href: '/dashboard/disputes', label: 'Disputes', icon: AlertCircleIcon, roles: ['MAMCOS_SECRETARY'], resource: 'disputes' },
      { href: '/dashboard/corrections', label: 'Corrections', icon: FileEditIcon, roles: ['MAMCOS_SECRETARY'], resource: 'farm_corrections' },
      { href: '/dashboard/compliance', label: 'Compliance', icon: File01Icon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'reports' },
      { href: '/dashboard/reports', label: 'Reports', icon: ChartBarLineIcon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'reports' },
      { href: '/dashboard/grantor', label: 'Grantor Impact', icon: ChartBarLineIcon, roles: ['AUDITOR', 'BUYER'], resource: 'reports' },
      { href: '/dashboard/ai', label: 'AI Insights', icon: ChartBarLineIcon, roles: ['MAMCOS_SECRETARY', 'FIELD_OFFICER', 'AUDITOR'], resource: 'ai_insights' },
      { href: '/dashboard/governance', label: 'Governance', icon: File01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'governance' },
      { href: '/dashboard/projects', label: 'Community Projects', icon: GiftIcon, roles: ['MAMCOS_SECRETARY'], resource: 'governance' },
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

/** Minimal auth subject the access helpers need (mirrors the auth store user). */
export interface AccessSubject {
  role?: string | null;
  roleId?: string | null;
  permissions?: { resource: string; action: string }[] | null;
}

const GOD_ROLES = new Set(['SUPER_ADMIN']);

/** Super Admin bypasses grants; every other account requires assigned permissions. */
export function hasPermission(
  subject: AccessSubject | null | undefined,
  resource: string,
  action: string,
): boolean {
  if (!subject?.role) return false;
  if (GOD_ROLES.has(subject.role)) return true;
  if (!subject.roleId) return false;
  return (subject.permissions ?? []).some(
    (p) => p.resource === resource && p.action === action,
  );
}

export function canView(
  subject: AccessSubject | null | undefined,
  resource?: string,
): boolean {
  if (!resource) return true;
  return hasPermission(subject, resource, 'VIEW');
}

function itemAllowed(item: NavItem, subject: AccessSubject | null | undefined): boolean {
  if (!subject?.role) return false;
  if (subject.role === 'SUPER_ADMIN') return true;
  if (!subject.roleId) return false;
  if (item.href === '/dashboard/roles') return false;
  if (item.href === '/dashboard') return true;
  return !!item.resource && hasPermission(subject, item.resource, 'VIEW');
}

export function getVisibleGroups(subject: AccessSubject | null | undefined): NavGroup[] {
  const seen = new Set<string>();
  return navGroups.map((group) => ({ ...group, items: group.items.filter((item) => {
    if (seen.has(item.href) || !itemAllowed(item, subject)) return false;
    if (subject?.role === 'SUPER_ADMIN' && !item.roles.includes('SUPER_ADMIN')) return false;
    seen.add(item.href);
    return true;
  }) })).filter((group) => group.items.length > 0);
}

export function isPathAllowed(pathname: string, subject: AccessSubject | null | undefined): boolean {
  if (pathname === '/dashboard' || pathname === '/dashboard/forbidden') return !!subject?.role;
  // Use the most specific match so /dashboard cannot authorize every child URL.
  const matches = navGroups.flatMap((g) => g.items).filter((item) =>
    pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)));
  const longest = Math.max(0, ...matches.map((item) => item.href.length));
  return matches.some((item) => item.href.length === longest && itemAllowed(item, subject));
}

/** Where each role lands after login / when hitting a denied route. */
export function landingFor(_role?: string | null): string {
  return '/dashboard';
}
