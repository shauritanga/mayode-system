import { BadRequestException } from '@nestjs/common';
import { CashAccountKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** The kind of money account a payment method belongs to; methods that are not cash, bank or mobile money have none. */
export const kindForMethod = (method?: string | null): CashAccountKind | undefined => {
  switch ((method ?? '').toUpperCase()) {
    case 'CASH': return 'CASH';
    case 'BANK': case 'BANK_TRANSFER': return 'BANK';
    case 'MOBILE_MONEY': return 'MOBILE_MONEY';
    default: return undefined;
  }
};

/**
 * Which money account a payment goes through: the one picked, or else the default account of the payment's kind
 * (cash, bank, mobile money), or else none (the money stays "not assigned" until it is moved into an account).
 */
export async function resolveCashAccount(db: Db, mamcosId: string | null, pick: { cashAccountId?: string | null; method?: string | null }): Promise<string | null> {
  if (!mamcosId) return null;
  if (pick.cashAccountId) {
    const a = await db.cashAccount.findFirst({ where: { id: pick.cashAccountId, mamcosId } });
    if (!a) throw new BadRequestException('Choose one of your own money accounts.');
    if (!a.isActive) throw new BadRequestException(`"${a.name}" is switched off.`);
    return a.id;
  }
  const kind = kindForMethod(pick.method);
  if (!kind) return null;
  const d = await db.cashAccount.findFirst({ where: { mamcosId, kind, isDefault: true, isActive: true }, select: { id: true } });
  return d?.id ?? null;
}
