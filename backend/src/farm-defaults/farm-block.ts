import { ConflictException } from '@nestjs/common';
import type { FarmAdminStatus } from '@prisma/client';

/** A farm whose owner's debt is overdue cannot be leased out, listed or declared self-operated until the debt is cleared. */
export function assertFarmNotBlocked(farm: { farmCode?: string | null; adminStatus?: FarmAdminStatus | null }) {
  if (farm.adminStatus && farm.adminStatus !== 'NORMAL') {
    throw new ConflictException(
      `This farm${farm.farmCode ? ` (${farm.farmCode})` : ''} is blocked from leasing because its owner's debt to the AMCOS is overdue. It is released when the debt is cleared`,
    );
  }
}
