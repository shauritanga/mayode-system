import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/ownership.service';
import { CreateAiIntegrationRecordDto } from './dto/ai-integration-record.dto';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertReferences(dto: CreateAiIntegrationRecordDto) {
    const checks: Promise<void>[] = [];
    if (dto.farmId) {
      checks.push(
        this.prisma.farm
          .findUnique({ where: { id: dto.farmId }, select: { id: true } })
          .then((record) => {
            if (!record)
              throw new NotFoundException(`Farm with ID ${dto.farmId} not found`);
          }),
      );
    }
    if (dto.cropCycleId) {
      checks.push(
        this.prisma.cropCycle
          .findUnique({
            where: { id: dto.cropCycleId },
            select: { id: true },
          })
          .then((record) => {
            if (!record)
              throw new NotFoundException(
                `Crop cycle with ID ${dto.cropCycleId} not found`,
              );
          }),
      );
    }
    if (dto.lotId) {
      checks.push(
        this.prisma.lot
          .findUnique({ where: { id: dto.lotId }, select: { id: true } })
          .then((record) => {
            if (!record)
              throw new NotFoundException(`Lot with ID ${dto.lotId} not found`);
          }),
      );
    }
    await Promise.all(checks);
  }

  async create(dto: CreateAiIntegrationRecordDto, user: RequestUser) {
    await this.assertReferences(dto);
    return this.prisma.aiIntegrationRecord.create({
      data: {
        sourceType: dto.sourceType,
        farmId: dto.farmId,
        cropCycleId: dto.cropCycleId,
        lotId: dto.lotId,
        externalReference: dto.externalReference,
        payload: dto.payload as Prisma.InputJsonValue,
        recommendation: dto.recommendation as Prisma.InputJsonValue,
        capturedByUserId: user.id,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
      },
    });
  }

  list(query: {
    sourceType?: string;
    farmId?: string;
    cropCycleId?: string;
    lotId?: string;
  }) {
    return this.prisma.aiIntegrationRecord.findMany({
      where: {
        sourceType: query.sourceType,
        farmId: query.farmId,
        cropCycleId: query.cropCycleId,
        lotId: query.lotId,
      },
      include: {
        farm: { select: { id: true, farmCode: true, name: true } },
        cropCycle: { select: { id: true, season: true, riceVariety: true } },
        lot: { select: { id: true, lotNumber: true } },
      },
      orderBy: { capturedAt: 'desc' },
      take: 100,
    });
  }
}
