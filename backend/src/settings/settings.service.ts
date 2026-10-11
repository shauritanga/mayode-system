import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateOrgSettingsDto,
  UpdateSalesSettingsDto,
  UpdateCalendarSettingsDto,
  UpsertNotificationTemplateDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Org profile (singleton row) ──
  async getOrgSettings() {
    const existing = await this.prisma.orgSettings.findFirst();
    if (existing) return existing;
    // No config yet — return sensible defaults without creating a row, so a read-only
    // caller never triggers a write.
    return {
      id: null,
      orgName: 'MAYODE Youth Development Group',
      logoUrl: null,
      contactEmail: null,
      contactPhone: null,
      address: null,
      updatedAt: null,
    };
  }

  async updateOrgSettings(dto: UpdateOrgSettingsDto) {
    const existing = await this.prisma.orgSettings.findFirst();
    if (existing) {
      return this.prisma.orgSettings.update({
        where: { id: existing.id },
        data: dto,
      });
    }
    return this.prisma.orgSettings.create({ data: dto });
  }

  // ── Sales & warehouse rules (platform-wide) ──
  async getSalesSettings(): Promise<UpdateSalesSettingsDto> {
    const row = await this.prisma.orgSettings.findFirst({
      select: { loadTolerancePct: true, reservationExpiryDays: true },
    });
    return {
      loadTolerancePct: row?.loadTolerancePct ?? 2,
      reservationExpiryDays: row?.reservationExpiryDays ?? 7,
    };
  }

  async updateSalesSettings(dto: UpdateSalesSettingsDto) {
    const existing = await this.prisma.orgSettings.findFirst();
    if (existing) {
      await this.prisma.orgSettings.update({
        where: { id: existing.id },
        data: dto,
      });
    } else {
      await this.prisma.orgSettings.create({
        data: { orgName: 'MAYODE Youth Development Group', ...dto },
      });
    }
    return this.getSalesSettings();
  }

  // ── Rice calendar reminders (platform-wide) ──
  async getCalendarSettings(): Promise<UpdateCalendarSettingsDto> {
    const row = await this.prisma.orgSettings.findFirst({
      select: {
        reminderLeadDays: true,
        missedGraceDays: true,
        reminderBySms: true,
      },
    });
    return {
      reminderLeadDays: row?.reminderLeadDays ?? 1,
      missedGraceDays: row?.missedGraceDays ?? 1,
      reminderBySms: row?.reminderBySms ?? true,
    };
  }

  async updateCalendarSettings(dto: UpdateCalendarSettingsDto) {
    const existing = await this.prisma.orgSettings.findFirst();
    if (existing) {
      await this.prisma.orgSettings.update({
        where: { id: existing.id },
        data: dto,
      });
    } else {
      await this.prisma.orgSettings.create({
        data: { orgName: 'MAYODE Youth Development Group', ...dto },
      });
    }
    return this.getCalendarSettings();
  }

  // ── Notification templates ──
  createTemplate(dto: UpsertNotificationTemplateDto) {
    return this.prisma.notificationTemplate.create({ data: dto });
  }

  findAllTemplates() {
    return this.prisma.notificationTemplate.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async findTemplateByKey(key: string) {
    return this.prisma.notificationTemplate.findUnique({ where: { key } });
  }

  async updateTemplate(id: string, dto: UpsertNotificationTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(
        `Notification template with ID ${id} not found`,
      );
    return this.prisma.notificationTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async removeTemplate(id: string) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(
        `Notification template with ID ${id} not found`,
      );
    await this.prisma.notificationTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
