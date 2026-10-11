/**
 * Farmers are not a managed role. They have their own dashboard and mobile app, and what they may do
 * is fixed in code (see isFarmerRoute in role-access.ts), not in a grant matrix an admin edits.
 *
 * Older deployments still hold a platform role named "Farmer" that early farmer accounts were linked
 * to. It is kept so those links stay valid, but it is hidden from role management and can never be
 * given to staff.
 */
export const LEGACY_FARMER_ROLE_NAME = 'Farmer';

/** Prisma filter that excludes the legacy platform "Farmer" role from role listings. */
export const NOT_LEGACY_FARMER_ROLE = {
  NOT: { mamcosId: null, name: { equals: LEGACY_FARMER_ROLE_NAME, mode: 'insensitive' as const } },
};

export function isLegacyFarmerRole(role: { name: string; mamcosId?: string | null }): boolean {
  return !role.mamcosId && role.name?.trim().toLowerCase() === LEGACY_FARMER_ROLE_NAME.toLowerCase();
}
