import { BadRequestException } from '@nestjs/common';

/** Name of the platform role used for farmer accounts when none is configured explicitly. */
export const DEFAULT_FARMER_ROLE_NAME = 'Farmer';

/**
 * The role every farmer account is created with. Farmers are not staff, so there is no
 * per-account choice: the platform designates one active, platform-level role either via
 * FARMER_SELF_REGISTRATION_ROLE_ID or by naming it "Farmer". It is never created or
 * granted permissions automatically.
 */
export async function resolveFarmerRole(
  prisma: { role: { findMany: (args: any) => Promise<any[]> } },
  configuredRoleId?: string,
) {
  const roles = await prisma.role.findMany({
    where: {
      isActive: true,
      isSystem: false,
      mamcosId: null,
      ...(configuredRoleId
        ? { id: configuredRoleId }
        : { name: { equals: DEFAULT_FARMER_ROLE_NAME, mode: 'insensitive' } }),
    },
    take: 2,
  });
  if (roles.length !== 1) {
    throw new BadRequestException('Farmer registration is not configured. Please contact support.');
  }
  return roles[0];
}
