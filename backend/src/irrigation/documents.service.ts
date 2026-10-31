import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { userNames } from './irrigation-common';
import { CreateDocumentDto } from './dto/irrigation.dto';

/** Registers files already uploaded through POST /uploads against a scheme, canal, block or transfer. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
  ) {}

  async list(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const where: Prisma.IrrigationDocumentWhereInput = {
      AND: [
        { scheme: this.scopeService.schemeWhere(scope) },
        // Restricted users only see documents attached to something inside their scope.
        scope.restricted
          ? { OR: [{ canalId: { in: scope.canalIds } }, { blockId: { in: scope.blockIds } }, { block: { canalId: { in: scope.canalIds } } }] }
          : {},
        { archivedAt: null },
        q.schemeId ? { schemeId: q.schemeId } : {},
        q.canalId ? { canalId: q.canalId } : {},
        q.blockId ? { blockId: q.blockId } : {},
        q.transferId ? { transferId: q.transferId } : {},
      ],
    };
    const rows = await this.prisma.irrigationDocument.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    const names = await userNames(this.prisma, rows.map((r) => r.uploadedById));
    return rows.map((r) => ({ ...r, uploadedBy: names.get(r.uploadedById ?? '') ?? null }));
  }

  async create(actor: RequestUser, dto: CreateDocumentDto) {
    const scope = await this.scopeService.resolve(actor);
    await this.scopeService.assertScheme(scope, dto.schemeId);
    if (dto.canalId) {
      const canal = await this.scopeService.assertCanal(scope, dto.canalId);
      if (canal.schemeId !== dto.schemeId) throw new BadRequestException('Canal is not part of this scheme');
    }
    if (dto.blockId) {
      const block = await this.scopeService.assertBlock(scope, dto.blockId);
      if (block.canal.schemeId !== dto.schemeId) throw new BadRequestException('Block is not part of this scheme');
    }
    if (dto.transferId) {
      const transfer = await this.prisma.irrigationAllocationTransfer.findFirst({
        where: { id: dto.transferId, hectare: this.scopeService.hectareWhere(scope) },
        select: { hectare: { select: { block: { select: { canal: { select: { schemeId: true } } } } } } },
      });
      if (!transfer || transfer.hectare.block.canal.schemeId !== dto.schemeId) throw new NotFoundException('Transfer not found');
    }
    if (dto.leadershipId) {
      const row = await this.prisma.irrigationLeadership.findFirst({
        where: { id: dto.leadershipId, canal: { schemeId: dto.schemeId, ...this.scopeService.canalWhere(scope) } },
      });
      if (!row) throw new NotFoundException('Appointment not found');
    }
    // Scoped users cannot attach scheme-wide files.
    if (scope.restricted && !dto.canalId && !dto.blockId && !dto.transferId && !dto.leadershipId)
      throw new BadRequestException('Attach the document to a canal, block or transfer');
    return this.prisma.irrigationDocument.create({
      data: {
        schemeId: dto.schemeId, canalId: dto.canalId ?? null, blockId: dto.blockId ?? null, transferId: dto.transferId ?? null,
        leadershipId: dto.leadershipId ?? null, type: dto.type ?? 'OTHER', title: dto.title.trim(), fileUrl: dto.fileUrl,
        fileName: dto.fileName, mimeType: dto.mimeType ?? null, sizeBytes: dto.sizeBytes ?? null, uploadedById: actor.id,
      },
    });
  }

  async archive(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const doc = await this.prisma.irrigationDocument.findFirst({ where: { id, scheme: this.scopeService.schemeWhere(scope) } });
    if (!doc) throw new NotFoundException('Document not found');
    if (scope.restricted && doc.uploadedById !== actor.id) throw new BadRequestException('You can only remove documents you uploaded');
    return this.prisma.irrigationDocument.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
