/**
 * Which subdomain build this is (baked in at build time via
 * NEXT_PUBLIC_APP_MODE) and which roles may authenticate against it.
 * Orthogonal to `nav.ts`, which gates *sections within* a dashboard once a
 * role is already known to belong here.
 */
export type AppMode = 'farmers' | 'cooperatives' | 'admin';

export const APP_MODE: AppMode =
  (process.env.NEXT_PUBLIC_APP_MODE as AppMode) || 'admin';

/** Which roles may authenticate against each subdomain build. */
export const APP_MODE_ROLES: Record<AppMode, string[]> = {
  farmers: ['FARMER'],
  cooperatives: ['MAMCOS_SECRETARY', 'FIELD_OFFICER'],
  admin: ['SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'CUSTOM', 'AUDITOR', 'BUYER', 'FINANCIAL_PROVIDER'],
};

/** Every subdomain a given role is permitted to use, for the rejection message. */
export const ROLE_ALLOWED_HOSTS: Record<string, string[]> = {
  FARMER: ['farmers.mayodegroup.com'],
  MAMCOS_SECRETARY: ['cooperatives.mayodegroup.com'],
  FIELD_OFFICER: ['cooperatives.mayodegroup.com', 'admin.mayodegroup.com'],
  SUPER_ADMIN: ['admin.mayodegroup.com'],
  ADMIN: ['admin.mayodegroup.com'],
  CUSTOM: ['admin.mayodegroup.com'],
  AUDITOR: ['admin.mayodegroup.com'],
  BUYER: ['admin.mayodegroup.com'],
  FINANCIAL_PROVIDER: ['admin.mayodegroup.com'],
};

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

export function isRoleAllowedInThisMode(role?: string | null): boolean {
  if (!role) return false;
  return APP_MODE_ROLES[APP_MODE].includes(role);
}
