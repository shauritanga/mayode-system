import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { generateAmcosCode } from './amcos-code';
import { findAmcosByCode, openJoinRequest } from './join-request-helpers';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  findByCode(db: Db, code: string) { return findAmcosByCode(db, code); }

  /** Public lookup so the sign-up screen can show the AMCOS name before the farmer confirms. Reveals the name only. */
  async lookup(code: string) {
    const found = await this.findByCode(this.prisma, code);
    if (!found) throw new NotFoundException('No AMCOS has that code. Check it with your AMCOS office.');
    return { name: found.name };
  }

  /** A fresh code for a new AMCOS; retries on the (unlikely) collision. */
  async newCode(name: string): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const code = generateAmcosCode(name);
      if (!(await this.prisma.mamcos.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
    throw new ConflictException('Could not allocate an AMCOS code; try again');
  }

  createForFarmer(db: Db, farmerId: string, code: string) { return openJoinRequest(db, farmerId, code); }

  private async farmerOf(user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true, mamcosId: true } });
    if (!farmer) throw new ForbiddenException('Only farmers can ask to join an AMCOS');
    return farmer;
  }

  async request(user: RequestUser, code: string) {
    const farmer = await this.farmerOf(user);
    return this.createForFarmer(this.prisma, farmer.id, code);
  }

  /** The farmer's own picture: current AMCOS, and the latest request. */
  async mine(user: RequestUser) {
    const farmer = await this.farmerOf(user);
    const [current, latest] = await Promise.all([
      farmer.mamcosId ? this.prisma.mamcos.findUnique({ where: { id: farmer.mamcosId }, select: { id: true, name: true } }) : null,
      this.prisma.amcosJoinRequest.findFirst({ where: { farmerId: farmer.id }, orderBy: { createdAt: 'desc' }, include: { mamcos: { select: { name: true } } } }),
    ]);
    return {
      amcos: current,
      request: latest ? { id: latest.id, status: latest.status, amcosName: latest.mamcos.name, rejectedReason: latest.rejectedReason, createdAt: latest.createdAt } : null,
    };
  }

  async cancel(user: RequestUser, id: string) {
    const farmer = await this.farmerOf(user);
    const request = await this.prisma.amcosJoinRequest.findFirst({ where: { id, farmerId: farmer.id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING') throw new ConflictException('This request is no longer pending');
    return this.prisma.amcosJoinRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
  }

  // ───────────── the AMCOS admin's side ─────────────

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage requests for your own cooperative');
    return id;
  }

  async list(actor: RequestUser, q: { status?: string; mamcosId?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const [mamcos, rows] = await Promise.all([
      this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true, code: true } }),
      this.prisma.amcosJoinRequest.findMany({
        where: { mamcosId, ...(q.status ? { status: q.status as never } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, user: { select: { phone: true } } } } },
      }),
    ]);
    return {
      amcos: mamcos,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      data: rows.map((r) => ({
        id: r.id, status: r.status, createdAt: r.createdAt, decidedAt: r.decidedAt, rejectedReason: r.rejectedReason,
        farmer: { id: r.farmer.id, name: `${r.farmer.firstName} ${r.farmer.lastName}`.trim(), memberNumber: r.farmer.controlNumber, village: r.farmer.village, phone: r.farmer.user?.phone ?? null },
      })),
    };
  }

  private async pendingOf(actor: RequestUser, id: string, requested?: string) {
    const mamcosId = this.tenant(actor, requested);
    const request = await this.prisma.amcosJoinRequest.findFirst({ where: { id, mamcosId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING') throw new ConflictException('This request has already been decided');
    return request;
  }

  async approve(actor: RequestUser, id: string, requested?: string) {
    const request = await this.pendingOf(actor, id, requested);
    return this.prisma.$transaction(async (tx) => {
      const farmer = await tx.farmer.findUnique({ where: { id: request.farmerId }, select: { mamcosId: true, verificationStatus: true } });
      if (farmer?.mamcosId && farmer.mamcosId !== request.mamcosId) {
        throw new ConflictException('This farmer has since joined another AMCOS');
      }
      // Approving someone into the AMCOS is the AMCOS vouching for them, so a farmer still waiting for review becomes verified.
      await tx.farmer.update({
        where: { id: request.farmerId },
        data: { mamcosId: request.mamcosId, ...(farmer?.verificationStatus === 'PENDING' ? { verificationStatus: 'VERIFIED', verifiedAt: new Date() } : {}) },
      });
      return tx.amcosJoinRequest.update({ where: { id }, data: { status: 'APPROVED', decidedById: actor.id, decidedAt: new Date() } });
    });
  }

  async reject(actor: RequestUser, id: string, reason: string, requested?: string) {
    await this.pendingOf(actor, id, requested);
    return this.prisma.amcosJoinRequest.update({
      where: { id }, data: { status: 'REJECTED', rejectedReason: reason.trim(), decidedById: actor.id, decidedAt: new Date() },
    });
  }
}
