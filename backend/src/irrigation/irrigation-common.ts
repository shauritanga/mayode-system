import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Permission-catalog resources used by the irrigation module (mirrored in web/src/lib/nav.ts). */
export const IRRIGATION_RESOURCE = 'irrigation';
export const ALLOCATION_RESOURCE = 'irrigation_allocations';
export const LEADERSHIP_RESOURCE = 'irrigation_leadership';

export type Db = Prisma.TransactionClient | PrismaService;

/** Decimal / null → number (land areas are stored as DECIMAL; the API returns plain numbers). */
export const num = (value: unknown): number =>
  value == null ? 0 : Number(value);

/** Calendar date (no time) from 'YYYY-MM-DD' or an ISO string; stored in DATE columns as UTC midnight. */
export function toDate(value: string | Date, field = 'date'): Date {
  const text = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${field}`);
  return date;
}

export const today = (): Date => toDate(new Date());

export const fullName = (p?: { firstName?: string | null; lastName?: string | null } | null) =>
  p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : null;

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export function paging(q: PageQuery, defaultSize = 25) {
  const pageSize = Math.min(Math.max(Math.floor(Number(q.pageSize) || defaultSize), 1), 200);
  const page = Math.max(Math.floor(Number(q.page) || 1), 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const paged = <T>(rows: T[], total: number, page: number, pageSize: number) => ({
  data: rows,
  meta: { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) },
});

/** Display names for a set of loose user-id references (created_by_id, approved_by_id …). */
export async function userNames(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
  return new Map(users.map((u) => [u.id, fullName(u) || u.phone]));
}

/** Postgres unique/check violations raised by the integrity rules in the migration → readable 4xx errors. */
export function rethrowIntegrity(error: unknown, messages: Record<string, string>): never {
  const message = error instanceof Error ? error.message : String(error);
  for (const [needle, text] of Object.entries(messages)) {
    if (message.includes(needle)) throw new ConflictException(text);
  }
  throw error;
}

/** Row-level lock on a farmer so concurrent allocations to the same member serialise (policy limits). */
export async function lockMember(tx: Prisma.TransactionClient, farmerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'irrigation-member:' + farmerId}))`;
}
