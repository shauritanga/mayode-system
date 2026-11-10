import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { localDate } from '../accounting/tax';

export const num = (v: unknown) => (v == null ? 0 : Number(v));
export const cents = (n: number) => Math.round(n * 100) / 100;
export const day = (v: string | Date) => new Date(`${(typeof v === 'string' ? v : v.toISOString()).slice(0, 10)}T00:00:00.000Z`);
export const today = () => day(localDate(new Date()));
export const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;

/** The cooperative a request works in: the caller's own, or the one chosen by Super Admin. */
export function tenantOf(ownership: OwnershipService, actor: RequestUser, requested?: string): string {
  const own = ownership.resolveTenantMamcosId(actor);
  const id = own ?? requested ?? null;
  if (!id) throw new BadRequestException('Choose a cooperative');
  if (own && requested && requested !== own) throw new ForbiddenException('You can only work with your own cooperative');
  return id;
}
