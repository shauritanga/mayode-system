import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentType } from '@prisma/client';

export interface CreateDocumentInput {
  type: DocumentType;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  notes?: string;
  uploadedById?: string;
}

/**
 * DocumentsService — shared management of Document rows for farmers & farms.
 * Reused by FarmersController and FarmsController.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForFarmer(farmerId: string, input: CreateDocumentInput) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    return this.prisma.document.create({ data: { ...input, farmerId } });
  }

  async createForFarm(farmId: string, input: CreateDocumentInput) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) throw new NotFoundException(`Farm with ID ${farmId} not found`);
    return this.prisma.document.create({ data: { ...input, farmId } });
  }

  listForFarmer(farmerId: string) {
    return this.prisma.document.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForFarm(farmId: string) {
    return this.prisma.document.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);
    return this.prisma.document.delete({ where: { id } });
  }
}
