import { APP_MODE } from './app-mode';
import { PORTAL_SECTIONS } from './portal-routes';
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
  /**
   * Built-in-role hint. Only used to keep FARMER-only items out of the
   * admin/cooperative portals; for every other account, visibility and route
   * access are decided solely by `resource` + the role's VIEW grant (see
   * `itemAllowed`). Do not rely on this list for authorization.
   */
  roles: string[];
  /**
   * Permission-catalog resource key guarding this section (mirrors the
   * backend `@RequirePermission('<resource>', 'VIEW')` on the matching
   * controller). Undefined = reserved for built-in navigation.
   */
  resource?: string;
  /** Show (and allow) the item when the role may view ANY of these resources. Used by pages that merge several areas into tabs. */
  anyResource?: string[];
  /** Kept so the route stays reachable and guarded, but not listed in the sidebar (its page is a tab of another item). */
  hidden?: boolean;
  /**
   * Landing page built for one specific persona (see `roles`). Shown in the
   * sidebar only to accounts whose role is listed; Super Admin and generic
   * custom roles don't see it, though the route stays reachable by URL.
   */
  persona?: boolean;
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
    ],
  },
  {
    label: 'Members & Farms',
    items: [
      { href: '/dashboard/farmers', label: 'Farmers', icon: UserGroupIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'farmers' },
      { href: '/dashboard/mamcos', label: 'AMCOS', icon: Building05Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'mamcos' },
      { href: '/dashboard/memberships', label: 'Membership', icon: StarIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'memberships' },
      { href: '/dashboard/farms', label: 'Farms', icon: Plant01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'farms' },
      { href: '/dashboard/field-officers', label: 'Field Officers', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'users' },
      { href: '/dashboard/rice-calendar', label: 'Rice Calendar', icon: BookOpen01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'rice_protocols' },
    ],
  },
  {
    label: 'Harvest & Sales',
    items: [
      { href: '/dashboard/inventory', label: 'Harvest & Lots', icon: Package01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'inventory' },
      { href: '/dashboard/warehouse', label: 'Warehouse counter', icon: Package01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'warehouse_desk', hidden: true },
      { href: '/dashboard/sale-orders', label: 'Cooperative sale orders', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'sale_orders', hidden: true },
      { href: '/dashboard/ops-orders', label: 'Orders & Sales', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN'], anyResource: ['ops_orders', 'ops_review', 'ops_payments', 'ops_customers', 'sale_orders', 'sales'] },
      { href: '/dashboard/ops-warehouse', label: 'Warehouse', icon: Package01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], anyResource: ['ops_receiving', 'ops_processing', 'ops_stock', 'ops_dispatch', 'ops_catalog', 'warehouse_desk'] },
      { href: '/dashboard/ops-farm', label: 'Mayode Farms', icon: Plant01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'ops_farm_tasks' },
      { href: '/dashboard/ops-field-work', label: 'My Field Work', icon: ClipboardIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'ops_field_work' },
      { href: '/dashboard/sales', label: 'Sales & farmer payouts', icon: Wallet01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'sales', hidden: true },
      { href: '/dashboard/market', label: 'Market & Buyers', icon: Store01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'buyers' },
      { href: '/dashboard/marketplace', label: 'MLAX', icon: ShoppingCart02Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'marketplace' },
    ],
  },
  {
    label: 'Money & Reports',
    items: [
      { href: '/dashboard/credit', label: 'Credit & Loans', icon: Wallet01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'loans' },
      { href: '/dashboard/reports', label: 'Reports', icon: ChartBarLineIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'reports' },
      { href: '/dashboard/audit-log', label: 'Audit Log', icon: File01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'audit_logs' },
      { href: '/dashboard/ai', label: 'AI Insights', icon: ChartBarLineIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'ai_insights' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/dashboard/users', label: 'User Accounts', icon: UserAdd01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'users' },
      { href: '/dashboard/roles', label: 'Roles & Permissions', icon: Shield01Icon, roles: ['SUPER_ADMIN'], resource: 'roles' },
      { href: '/dashboard/settings', label: 'Settings & Integrations', icon: Shield01Icon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'settings' },
      { href: '/dashboard/rewards', label: 'Rewards', icon: GiftIcon, roles: ['SUPER_ADMIN', 'ADMIN'], resource: 'rewards' },
    ],
  },
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home01Icon, roles: ['MAMCOS_SECRETARY'] },
      { href: '/dashboard/farmer', label: 'Overview', icon: Home01Icon, roles: ['FARMER'] },
      { href: '/dashboard/field-officer', label: 'Field Dashboard', icon: MapsSearchIcon, roles: ['FIELD_OFFICER'], persona: true },
      { href: '/dashboard/auditor', label: 'Auditor Dashboard', icon: File01Icon, roles: ['AUDITOR'], resource: 'reports', persona: true },
      { href: '/dashboard/financial-provider', label: 'Credit Dashboard', icon: Wallet01Icon, roles: ['FINANCIAL_PROVIDER'], resource: 'farmers', persona: true },
      { href: '/dashboard/buyer', label: 'Buyer Portal', icon: DashboardSquare01Icon, roles: ['BUYER'], resource: 'buyer_portal', persona: true },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/dashboard/staff', label: 'Staff', icon: UserAdd01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'users' },
      { href: '/dashboard/field-officers', label: 'Field Officers', icon: UserGroupIcon, roles: ['MAMCOS_SECRETARY'], resource: 'users' },
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
      { href: '/dashboard/inventory', label: 'Harvest & Lots', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'inventory' },
      { href: '/dashboard/collection-centres', label: 'Collection Centres', icon: Building05Icon, roles: ['MAMCOS_SECRETARY'], resource: 'inventory' },
      { href: '/dashboard/traceability', label: 'Traceability', icon: MapsSearchIcon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'sales' },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'suppliers' },
      { href: '/dashboard/finance', label: 'Finance and Accounting', icon: Wallet01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'finance' },
      { href: '/dashboard/credit', label: 'Credit & Loans', icon: Wallet01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'loans' },
      { href: '/dashboard/marketplace', label: 'M-LAX Marketplace', icon: ShoppingCart02Icon, roles: ['MAMCOS_SECRETARY'], resource: 'marketplace' },
      { href: '/dashboard/sale-orders', label: 'Cooperative sale orders', icon: ShoppingCart02Icon, roles: ['MAMCOS_SECRETARY'], resource: 'sale_orders', hidden: true },
      { href: '/dashboard/ops-orders', label: 'Orders & Sales', icon: ShoppingCart02Icon, roles: ['MAMCOS_SECRETARY'], anyResource: ['ops_orders', 'ops_review', 'ops_payments', 'ops_customers', 'sale_orders', 'sales'] },
      { href: '/dashboard/ops-warehouse', label: 'Warehouse', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'], anyResource: ['ops_receiving', 'ops_processing', 'ops_stock', 'ops_dispatch', 'ops_catalog', 'warehouse_desk'] },
      { href: '/dashboard/ops-farm', label: 'Mayode Farms', icon: Plant01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'ops_farm_tasks' },
      { href: '/dashboard/ops-field-work', label: 'My Field Work', icon: ClipboardIcon, roles: ['MAMCOS_SECRETARY'], resource: 'ops_field_work' },
      { href: '/dashboard/warehouse', label: 'Warehouse counter', icon: Package01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'warehouse_desk', hidden: true },
      { href: '/dashboard/market', label: 'Market & Buyers', icon: Store01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'buyers' },
      { href: '/dashboard/sales', label: 'Sales & farmer payouts', icon: Wallet01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'sales', hidden: true },
      { href: '/dashboard/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'insurance' },
    ],
  },
  {
    label: 'Governance & Insights',
    items: [
      { href: '/dashboard/disputes', label: 'Disputes', icon: AlertCircleIcon, roles: ['MAMCOS_SECRETARY'], resource: 'disputes' },
      { href: '/dashboard/corrections', label: 'Corrections', icon: FileEditIcon, roles: ['MAMCOS_SECRETARY'], resource: 'farm_corrections' },
      { href: '/dashboard/compliance', label: 'Compliance', icon: File01Icon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'reports' },
      { href: '/dashboard/reports', label: 'Reports', icon: ChartBarLineIcon, roles: ['MAMCOS_SECRETARY', 'AUDITOR'], resource: 'reports' },
      { href: '/dashboard/audit-log', label: 'Audit Log', icon: File01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'audit_logs' },
      { href: '/dashboard/premium-fund', label: 'Fairtrade Premium Fund', icon: Wallet01Icon, roles: ['MAMCOS_SECRETARY'], resource: 'reports' },
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
      { href: '/dashboard/farmer/weather', label: 'Weather', icon: CloudSunRainIcon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/finance', label: 'Finance', icon: Wallet01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/loans', label: 'My Loans', icon: Wallet01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/insurance', label: 'Insurance', icon: Shield01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/membership', label: 'Membership', icon: StarIcon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/votes', label: 'Votes', icon: File01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/alerts', label: 'Alerts', icon: BellIcon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/marketplace', label: 'Marketplace', icon: ShoppingCart02Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/warehouse', label: 'My deliveries', icon: Package01Icon, roles: ['FARMER'] },
      { href: '/dashboard/farmer/community', label: 'Cooperative updates', icon: UserGroupIcon, roles: ['FARMER'] },
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
  if (!subject?.role || !isPortalPath(item.href)) return false;
  if (subject.role === 'SUPER_ADMIN') return true;
  if (APP_MODE === 'farmers') return subject.role === 'FARMER' && item.roles.includes('FARMER');
  if (!subject.roleId) return false;
  // Platform-wide role management is Super Admin only; cooperative admins manage their own
  // AMCOS's roles from the cooperatives portal, gated by the `roles` grant.
  if (item.href === '/dashboard/roles' && APP_MODE === 'admin') return false;
  if (item.href === '/dashboard') return true;
  if (item.href === '/dashboard/field-officer') return subject.role === 'FIELD_OFFICER';
  if (item.anyResource) return item.anyResource.some((r) => hasPermission(subject, r, 'VIEW'));
  return !!item.resource && hasPermission(subject, item.resource, 'VIEW');
}

/** Hidden from the Mayode admin sidebar (the cooperatives portal keeps them). Direct URLs are still guarded by permissions. */
const ADMIN_PORTAL_HIDDEN_HREFS = new Set([
  '/dashboard/collection-centres',
  '/dashboard/finance',
  '/dashboard/weather',
  '/dashboard/alerts',
  '/dashboard/locations',
  '/dashboard/facilities',
  '/dashboard/premium-fund',
]);
const ADMIN_PORTAL_HIDDEN_GROUPS = new Set(['Governance & Insights']);

export function getVisibleGroups(subject: AccessSubject | null | undefined): NavGroup[] {
  const seen = new Set<string>();
  const trimAdminPortal = APP_MODE === 'admin' && (subject?.role === 'SUPER_ADMIN' || subject?.role === 'ADMIN');
  return navGroups.map((group) => ({ ...group, items: group.items.filter((item) => {
    if (trimAdminPortal && (ADMIN_PORTAL_HIDDEN_GROUPS.has(group.label) || ADMIN_PORTAL_HIDDEN_HREFS.has(item.href))) return false;
    if (item.hidden || seen.has(item.href) || !itemAllowed(item, subject)) return false;
    if (item.persona && !(subject?.role && item.roles.includes(subject.role))) return false;
    if (APP_MODE !== 'farmers' && item.roles.length === 1 && item.roles[0] === 'FARMER') return false;
    seen.add(item.href);
    return true;
  }) })).filter((group) => group.items.length > 0);
}

export function isPortalPath(pathname: string): boolean {
  if (pathname === '/dashboard') return true;
  const section = pathname.split('/')[2];
  return (PORTAL_SECTIONS[APP_MODE] as readonly string[]).includes(section);
}

export function isPathAllowed(pathname: string, subject: AccessSubject | null | undefined): boolean {
  if (!isPortalPath(pathname)) return false;
  if (pathname === '/dashboard/profile') return !!subject?.role;
  if (APP_MODE === 'farmers' && (pathname === '/dashboard/farmer' || pathname.startsWith('/dashboard/farmer/'))) {
    const suffix = pathname.slice('/dashboard/farmer'.length);
    return subject?.role === 'FARMER' && ['', '/farms', '/crop-cycles', '/rice-tasks', '/finance', '/loans', '/weather', '/insurance', '/membership', '/votes', '/alerts', '/marketplace', '/consent', '/warehouse', '/community'].includes(suffix);
  }
  if (pathname === '/dashboard' || pathname === '/dashboard/forbidden') return !!subject?.role;
  // Use the most specific match so /dashboard cannot authorize every child URL.
  const matches = navGroups.flatMap((g) => g.items).filter((item) =>
    pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)));
  const longest = Math.max(0, ...matches.map((item) => item.href.length));
  return matches.some((item) => item.href.length === longest && itemAllowed(item, subject));
}

/** Where each role lands after login / when hitting a denied route. */
export function landingFor(_role?: string | null): string {
  return APP_MODE === 'farmers' ? '/dashboard/farmer' : '/dashboard';
}
