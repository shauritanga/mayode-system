import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertChannel, Prisma, UserRole, WeatherAlertSeverity, WeatherAlertType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService, normalizeMsisdn } from '../messaging/sms.service';
import { WhatsappService } from '../messaging/whatsapp.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestUser } from '../common/ownership.service';
import { CreateWeatherAlertDto, UpdateWeatherAlertDto } from './dto/weather.dto';

const TEMPLATE_KEY = 'weather_alert';
const CHUNK = 25;

type AlertRow = Prisma.WeatherAlertGetPayload<object>;

@Injectable()
export class WeatherAlertsService {
  private readonly logger = new Logger(WeatherAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly whatsapp: WhatsappService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  private tenant(user: RequestUser) {
    return user.role === UserRole.SUPER_ADMIN ? null : (user.mamcosId ?? null);
  }

  // ---------- reading ----------

  /** What each kind of person may see: staff their cooperative's (and platform-wide) alerts, farmers the sent alerts for their area. */
  async list(user: RequestUser, filter: { status?: string } = {}) {
    if (user.role === UserRole.FARMER) {
      const f = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { mamcosId: true, region: true, district: true, ward: true } });
      if (!f) return [];
      return this.prisma.weatherAlert.findMany({
        where: {
          status: 'SENT',
          AND: [
            { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
            { OR: [{ mamcosId: null }, ...(f.mamcosId ? [{ mamcosId: f.mamcosId }] : [])] },
            { OR: [{ region: null }, ...(f.region ? [{ region: f.region }] : [])] },
            { OR: [{ district: null }, ...(f.district ? [{ district: f.district }] : [])] },
            { OR: [{ ward: null }, ...(f.ward ? [{ ward: f.ward }] : [])] },
          ],
        },
        orderBy: { sentAt: 'desc' },
        take: 50,
      });
    }
    const tenant = this.tenant(user);
    return this.prisma.weatherAlert.findMany({
      where: {
        ...(tenant ? { OR: [{ mamcosId: tenant }, { mamcosId: null }] } : {}),
        // Only the cooperative that owns a draft sees it.
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(user.role === UserRole.FIELD_OFFICER ? { status: 'SENT' as const } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  private async owned(id: string, user: RequestUser) {
    const alert = await this.prisma.weatherAlert.findUnique({ where: { id } });
    const tenant = this.tenant(user);
    if (!alert || (tenant && alert.mamcosId !== tenant)) throw new NotFoundException('Weather alert not found');
    return alert;
  }

  async deliveries(id: string, user: RequestUser) {
    const alert = await this.prisma.weatherAlert.findUnique({ where: { id } });
    const tenant = this.tenant(user);
    if (!alert || (tenant && alert.mamcosId !== tenant && alert.mamcosId !== null)) throw new NotFoundException('Weather alert not found');
    const rows = await this.prisma.alertDelivery.groupBy({ by: ['channel', 'status'], where: { alertId: id }, _count: { _all: true } });
    const failed = await this.prisma.alertDelivery.findMany({ where: { alertId: id, status: 'FAILED' }, take: 50, orderBy: { createdAt: 'desc' } });
    const names = failed.length
      ? new Map((await this.prisma.farmer.findMany({ where: { id: { in: failed.map((f) => f.farmerId).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true, controlNumber: true } })).map((f) => [f.id, f]))
      : new Map();
    return {
      byChannel: rows.map((r) => ({ channel: r.channel, status: r.status, count: r._count._all })),
      failed: failed.map((f) => ({ channel: f.channel, detail: f.detail, farmer: f.farmerId ? names.get(f.farmerId) ?? null : null })),
    };
  }

  // ---------- writing ----------

  /** A person writes an alert. By default it goes out straight away; with sendNow=false it waits as a draft. */
  async create(user: RequestUser, dto: CreateWeatherAlertDto) {
    const tenant = this.tenant(user);
    if (!tenant && user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only Super Admin or a cooperative can issue alerts');
    const mamcosId = tenant ?? dto.mamcosId ?? null;
    const alert = await this.prisma.weatherAlert.create({
      data: {
        region: dto.region, district: dto.district, ward: dto.ward,
        alertType: dto.alertType, severity: dto.severity ?? WeatherAlertSeverity.MEDIUM,
        title: dto.title, message: dto.message, titleSw: dto.titleSw, messageSw: dto.messageSw,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        issuedById: user.id, mamcosId, source: 'MANUAL', status: 'DRAFT',
      },
    });
    return dto.sendNow === false ? alert : this.dispatch(alert.id, user.id);
  }

  async update(id: string, dto: UpdateWeatherAlertDto, user: RequestUser) {
    const alert = await this.owned(id, user);
    if (alert.status !== 'DRAFT') throw new ConflictException('Only a draft alert can be edited');
    return this.prisma.weatherAlert.update({
      where: { id },
      data: {
        title: dto.title, message: dto.message, titleSw: dto.titleSw, messageSw: dto.messageSw,
        severity: dto.severity, validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });
  }

  async dismiss(id: string, user: RequestUser) {
    const alert = await this.owned(id, user);
    if (alert.status !== 'DRAFT') throw new ConflictException('Only a draft alert can be dismissed');
    return this.prisma.weatherAlert.update({ where: { id }, data: { status: 'DISMISSED', reviewedByUserId: user.id } });
  }

  async send(id: string, user: RequestUser) {
    const alert = await this.owned(id, user);
    if (alert.status !== 'DRAFT') throw new ConflictException('This alert has already been sent or dismissed');
    return this.dispatch(id, user.id);
  }

  // ---------- sending ----------

  private smsBody(alert: AlertRow, template: { body: string } | null, sw: boolean) {
    const title = sw ? alert.titleSw ?? alert.title : alert.title;
    const message = sw ? alert.messageSw ?? alert.message : alert.message;
    return template
      ? template.body.replace('{alertType}', alert.alertType).replace('{title}', title).replace('{message}', message)
      : `MAYODE ${sw ? 'TAHADHARI' : 'ALERT'} (${alert.alertType}): ${title} — ${message}`;
  }

  /** Claims the draft, then reaches every farmer by SMS, the app and (if they agreed) WhatsApp, and tells their field officers. */
  private async dispatch(id: string, byUserId: string) {
    const claimed = await this.prisma.weatherAlert.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'SENT', sentAt: new Date(), reviewedByUserId: byUserId } });
    if (!claimed.count) throw new ConflictException('This alert has already been sent');
    const alert = (await this.prisma.weatherAlert.findUnique({ where: { id } }))!;
    const template = await this.settings.findTemplateByKey(TEMPLATE_KEY);

    const farmers = await this.prisma.farmer.findMany({
      where: {
        ...(alert.mamcosId ? { mamcosId: alert.mamcosId } : {}),
        ...(alert.region ? { region: alert.region } : {}),
        ...(alert.district ? { district: alert.district } : {}),
        ...(alert.ward ? { ward: alert.ward } : {}),
      },
      select: { id: true, userId: true, whatsappOptIn: true, assignedOfficerId: true, user: { select: { phone: true, language: true } } },
    });

    const counts = { sms: 0, app: 0, whatsapp: 0 };
    for (let i = 0; i < farmers.length; i += CHUNK) {
      const rows: Prisma.AlertDeliveryCreateManyInput[] = [];
      await Promise.all(
        farmers.slice(i, i + CHUNK).map(async (f) => {
          const sw = f.user?.language !== 'en';
          const title = sw ? alert.titleSw ?? alert.title : alert.title;
          const message = sw ? alert.messageSw ?? alert.message : alert.message;
          const row = (channel: AlertChannel, status: string, detail?: string) => rows.push({ alertId: id, farmerId: f.id, userId: f.userId, channel, status, detail });
          if (f.userId) {
            try {
              await this.notifications.create({
                userId: f.userId, type: 'WEATHER_ALERT', title: `${sw ? 'Tahadhari ya hali ya hewa' : 'Weather Alert'}: ${title}`, body: message,
                data: { alertId: id, alertType: alert.alertType, severity: alert.severity },
              });
              counts.app += 1; row('APP', 'SENT');
            } catch (e) { row('APP', 'FAILED', e instanceof Error ? e.message : 'error'); }
          }
          if (f.user?.phone) {
            const ok = await this.sms.sendTransactional(normalizeMsisdn(f.user.phone), this.smsBody(alert, template, sw), 'weather_alert');
            if (ok) counts.sms += 1;
            row('SMS', ok ? 'SENT' : 'FAILED');
            if (f.whatsappOptIn) {
              const r = await this.whatsapp.sendTemplate(f.user.phone, this.whatsapp.alertTemplate, sw ? 'sw' : 'en', [title, message], 'whatsapp_weather');
              if (r.ok) counts.whatsapp += 1;
              row('WHATSAPP', r.ok ? 'SENT' : 'FAILED', r.detail);
            }
          } else {
            row('SMS', 'SKIPPED', 'No phone number');
          }
        }),
      );
      await this.prisma.alertDelivery.createMany({ data: rows });
    }

    const officers = await this.notifyOfficers(alert, farmers);
    return this.prisma.weatherAlert.update({
      where: { id },
      data: { smsSentCount: counts.sms, appSentCount: counts.app, whatsappSentCount: counts.whatsapp, officersNotified: officers },
    });
  }

  /** Each field officer is told how many of their own farmers the alert covers, so they can follow up in person. */
  private async notifyOfficers(alert: AlertRow, farmers: { id: string; assignedOfficerId: string | null }[]) {
    const byOfficer = new Map<string, string[]>();
    for (const f of farmers) if (f.assignedOfficerId) byOfficer.set(f.assignedOfficerId, [...(byOfficer.get(f.assignedOfficerId) ?? []), f.id]);
    if (!byOfficer.size) return 0;
    const staff = await this.prisma.mamcosStaff.findMany({
      where: { id: { in: [...byOfficer.keys()] }, role: 'FIELD_OFFICER' },
      select: { id: true, user: { select: { id: true, phone: true } } },
    });
    const place = [alert.ward, alert.district, alert.region].filter(Boolean).join(', ') || 'your area';
    let notified = 0;
    for (const o of staff) {
      const ids = byOfficer.get(o.id) ?? [];
      const text = `${alert.title}: ${ids.length} of your farmers in ${place} are covered. Please call or visit them.`;
      try {
        await this.notifications.create({
          userId: o.user.id, type: 'WEATHER_ALERT_OFFICER', title: `Weather alert: ${alert.title}`, body: text,
          data: { alertId: alert.id, farmerIds: ids.slice(0, 200) },
        });
        if (o.user.phone) await this.sms.send(normalizeMsisdn(o.user.phone), `MAYODE: ${text}`, 'weather_alert_officer');
        await this.prisma.alertDelivery.create({ data: { alertId: alert.id, userId: o.user.id, channel: 'OFFICER', status: 'SENT', detail: `${ids.length} farmers` } });
        notified += 1;
      } catch (e) {
        this.logger.warn(`Officer notice failed: ${e instanceof Error ? e.message : e}`);
        await this.prisma.alertDelivery.create({ data: { alertId: alert.id, userId: o.user.id, channel: 'OFFICER', status: 'FAILED' } }).catch(() => undefined);
      }
    }
    return notified;
  }

  // ---------- preferences ----------

  async setWhatsapp(user: RequestUser, optIn: boolean, farmerId?: string) {
    if (user.role === UserRole.FARMER) {
      const f = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!f) throw new NotFoundException('Farmer not found');
      return this.prisma.farmer.update({ where: { id: f.id }, data: { whatsappOptIn: optIn }, select: { id: true, whatsappOptIn: true } });
    }
    if (!farmerId) throw new BadRequestException('Choose the farmer');
    const tenant = this.tenant(user);
    const f = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true } });
    if (!f || (tenant && f.mamcosId !== tenant)) throw new NotFoundException('Farmer not found');
    return this.prisma.farmer.update({ where: { id: f.id }, data: { whatsappOptIn: optIn }, select: { id: true, whatsappOptIn: true } });
  }

  async preferences(user: RequestUser) {
    const f = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { whatsappOptIn: true } });
    return { whatsappOptIn: f?.whatsappOptIn ?? false };
  }
}

export { WeatherAlertType };
