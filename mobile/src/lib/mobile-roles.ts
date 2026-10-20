/**
 * Roles with intentional mobile product surfaces.
 * Buyer / auditor / financial-provider accounts use the web dashboard instead.
 */
export const MOBILE_ALLOWED_ROLES = [
  'FARMER',
  'FIELD_OFFICER',
  'MAMCOS_SECRETARY',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export type MobileAllowedRole = (typeof MOBILE_ALLOWED_ROLES)[number];

export function isMobileAllowedRole(
  role: string | null | undefined,
): role is MobileAllowedRole {
  return (
    !!role &&
    (MOBILE_ALLOWED_ROLES as readonly string[]).includes(role)
  );
}

export function isStaffRole(role: string | null | undefined) {
  return !!role && role !== 'FARMER' && isMobileAllowedRole(role);
}
