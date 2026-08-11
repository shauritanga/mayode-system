import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrgSettingsDto, UpsertNotificationTemplateDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Org profile (singleton row) ──
  async getOrgSettings() {
    const existing = await this.prisma.orgSettings.findFirst();
    if (existing) return existing;
    // No config yet — return sensible defaults without creating a row, so a read-only
    // caller never triggers a write.
    return { id: null, orgName: 'MAYODE Youth Development Group', logoUrl: null, contactEmail: null, contactPhone: null, address: null, updatedAt: null };
  }

  async updateOrgSettings(dto: UpdateOrgSettingsDto) {
    const existing = await this.prisma.orgSettings.findFirst();
    if (existing) {
      return this.prisma.orgSettings.update({ where: { id: existing.id }, data: dto });
    }
    return this.prisma.orgSettings.create({ data: dto });
  }

  // ── Notification templates ──
  createTemplate(dto: UpsertNotificationTemplateDto) {
    return this.prisma.notificationTemplate.create({ data: dto });
  }

  findAllTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
  }

  async findTemplateByKey(key: string) {
    return this.prisma.notificationTemplate.findUnique({ where: { key } });
  }

  async updateTemplate(id: string, dto: UpsertNotificationTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Notification template with ID ${id} not found`);
    return this.prisma.notificationTemplate.update({ where: { id }, data: dto });
  }

  async removeTemplate(id: string) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Notification template with ID ${id} not found`);
    await this.prisma.notificationTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
