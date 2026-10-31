import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { normalizeAmcosCode } from './amcos-code';

type Db = Prisma.TransactionClient | PrismaService;

/** Codes are stored as generated (e.g. MAD-4F2A91) and matched ignoring case, spaces and the dash. */
export async function findAmcosByCode(db: Db, code: string) {
  const wanted = normalizeAmcosCode(code ?? '');
  if (wanted.length < 4) return null;
  const rows = await db.mamcos.findMany({ where: { code: { not: null }, isActive: true }, select: { id: true, name: true, code: true } });
  return rows.find((m) => normalizeAmcosCode(m.code!) === wanted) ?? null;
}

/** Opens a pending request for a farmer. Used at sign-up and from an existing farmer's profile. */
export async function openJoinRequest(db: Db, farmerId: string, code: string) {
  const mamcos = await findAmcosByCode(db, code);
  if (!mamcos) throw new BadRequestException('No AMCOS has that code. Check it with your AMCOS office.');
  const farmer = await db.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true } });
  if (!farmer) throw new NotFoundException('Farmer not found');
  if (farmer.mamcosId === mamcos.id) throw new ConflictException(`You are already a member of ${mamcos.name}`);
  if (farmer.mamcosId) throw new ConflictException('You already belong to another AMCOS. Ask that AMCOS to release you first.');
  const open = await db.amcosJoinRequest.findFirst({ where: { farmerId, status: 'PENDING' } });
  if (open) throw new ConflictException('You already have a request waiting for approval');
  const request = await db.amcosJoinRequest.create({ data: { farmerId, mamcosId: mamcos.id } });
  return { id: request.id, status: request.status, amcosName: mamcos.name };
}
