/**
 * Which subdomain build this is (baked in at build time via
 * NEXT_PUBLIC_APP_MODE) and which roles may authenticate against it.
 * Orthogonal to `nav.ts`, which gates *sections within* a dashboard once a
 * role is already known to belong here.
 */
export type AppMode = 'farmers' | 'cooperatives' | 'admin';

export const APP_MODE: AppMode =
  (process.env.NEXT_PUBLIC_APP_MODE as AppMode) || 'admin';

/** Built-in roles that always belong to the cooperatives portal. */
const COOPERATIVE_STAFF_ROLES = ['MAMCOS_SECRETARY', 'FIELD_OFFICER'];

/** The slice of the session user the portal check needs. */
export interface PortalAccount {
  role?: string | null;
  mamcosId?: string | null;
}

/**
 * Which portal an account may sign in to. Decided by who the account belongs to, not by a
 * role label: farmers use the farmer portal; anyone tied to a cooperative (its admin, staff,
 * secretary, field officers) uses the cooperatives portal; everyone else — Super Admin and
 * platform staff — uses the admin portal. Field officers may use either.
 */
export function isAccountAllowedInMode(mode: AppMode, account?: PortalAccount | null): boolean {
  const role = account?.role;
  if (!role) return false;
  const inCooperative = COOPERATIVE_STAFF_ROLES.includes(role) || !!account?.mamcosId;
  switch (mode) {
    case 'farmers':
      return role === 'FARMER';
    case 'cooperatives':
      return role !== 'FARMER' && role !== 'SUPER_ADMIN' && inCooperative;
    case 'admin':
      return role === 'SUPER_ADMIN' || role === 'FIELD_OFFICER' || (role !== 'FARMER' && role !== 'MAMCOS_SECRETARY' && !account?.mamcosId);
  }
}

const HOSTS: Record<AppMode, string> = {
  farmers: 'farmers.mayodegroup.com',
  cooperatives: 'cooperatives.mayodegroup.com',
  admin: 'admin.mayodegroup.com',
};

/** Every subdomain an account is permitted to use, for the rejection message. */
export function allowedHostsFor(account?: PortalAccount | null): string[] {
  return (Object.keys(HOSTS) as AppMode[]).filter((m) => isAccountAllowedInMode(m, account)).map((m) => HOSTS[m]);
}

export const APP_MODE_LABEL: Record<AppMode, string> = {
  farmers: 'Farmer Portal',
  cooperatives: 'Cooperative Portal',
  admin: 'Admin Portal',
};

/** Login-page copy tailored to whichever role signs in on this subdomain. */
export const APP_MODE_LOGIN_COPY: Record<
  AppMode,
  { subtitle: string; tagline: string; description: string }
> = {
  farmers: {
    subtitle: 'Sign in to manage your farms and track your season.',
    tagline: 'Your farm, tracked and rewarded.',
    description:
      'Register your farms, follow crop cycles, get weather and farm alerts, and access credit, insurance and the M-LAX Marketplace.',
  },
  cooperatives: {
    subtitle: 'Sign in to your Cooperative Portal.',
    tagline: 'The integrated platform for AMCOS and Cooperatives in Tanzania.',
    description:
      'Traceability, farmer records, crop cycles, insurance, credit and the M-LAX Marketplace all in one place.',
  },
  admin: {
    subtitle: 'Sign in to the MAYODE GROUP Admin Portal.',
    tagline: 'Oversight across every farmer, cooperative and transaction.',
    description:
      'Manage roles and staff, finance and accounting, marketplace operations, and platform-wide reporting.',
  },
};

export function isAccountAllowedInThisMode(account?: PortalAccount | null): boolean {
  return isAccountAllowedInMode(APP_MODE, account);
}
