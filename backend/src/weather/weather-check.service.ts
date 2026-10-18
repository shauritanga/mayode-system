import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WeatherService } from './weather.service';
import { WeatherAreasService } from './weather-areas.service';
import { alertAreaKey, draftAlerts, summarize, type ForecastDay } from './weather-rules';

const DAY = 86_400_000;
const DEDUPE_DAYS = 5;
const STALE_DRAFT_DAYS = 3;

/**
 * Every morning: refresh each place's forecast, and where it justifies a warning draft one for the
 * cooperative to review. Nothing is sent to farmers until a person approves the draft.
 */
@Injectable()
export class WeatherCheckService {
  private readonly logger = new Logger(WeatherCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly areas: WeatherAreasService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(process.env.WEATHER_CHECK_CRON || '30 5 * * *', { name: 'weather-early-warning', timeZone: 'Africa/Dar_es_Salaam' })
  async scheduled() {
    try {
      const r = await this.run();
      this.logger.log(`Weather check: ${r.areas} area(s), ${r.drafted} draft(s), ${r.failed} forecast failure(s)`);
    } catch (e) {
      this.logger.error(`Weather check failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async run() {
    const result = { areas: 0, drafted: 0, failed: 0, expired: 0 };
    // Drafts nobody reviewed in a few days describe weather that has passed.
    const stale = await this.prisma.weatherAlert.updateMany({
      where: { status: 'DRAFT', source: 'AUTO', createdAt: { lt: new Date(Date.now() - STALE_DRAFT_DAYS * DAY) } },
      data: { status: 'DISMISSED' },
    });
    result.expired = stale.count;

    const areas = await this.areas.areas();
    const forecasts = new Map<string, ForecastDay[] | null>();
    const newByCoop = new Map<string, number>();

    for (const area of areas) {
      if (area.latitude == null || area.longitude == null) continue;
      result.areas += 1;
      const placeKey = `${area.region ?? ''}|${area.district}`;
      if (!forecasts.has(placeKey)) {
        try {
          const snap = await this.weather.refreshSnapshot(area.region, area.district, area.latitude, area.longitude);
          forecasts.set(placeKey, snap.days as unknown as ForecastDay[]);
        } catch {
          forecasts.set(placeKey, null);
          result.failed += 1;
        }
      }
      const days = forecasts.get(placeKey);
      if (!days) continue;

      const drafts = draftAlerts(summarize(days), area.crops, area.district);
      for (const d of drafts) {
        const recent = await this.prisma.weatherAlert.findFirst({
          where: {
            mamcosId: area.mamcosId, region: area.region, district: area.district, alertType: d.type, source: 'AUTO',
            status: { in: ['DRAFT', 'SENT'] }, createdAt: { gte: new Date(Date.now() - DEDUPE_DAYS * DAY) },
          },
          select: { id: true },
        });
        if (recent) continue;
        await this.prisma.weatherAlert.create({
          data: {
            mamcosId: area.mamcosId, region: area.region, district: area.district,
            alertType: d.type, severity: d.severity, title: d.en.title, message: d.en.message,
            titleSw: d.sw.title, messageSw: d.sw.message, source: 'AUTO', status: 'DRAFT',
            evidence: d.evidence as never, validUntil: new Date(Date.now() + 4 * DAY),
          },
        });
        result.drafted += 1;
        newByCoop.set(area.mamcosId, (newByCoop.get(area.mamcosId) ?? 0) + 1);
      }
    }

    for (const [mamcosId, n] of newByCoop) await this.tellReviewers(mamcosId, n);
    return result;
  }

  /** Staff who can issue alerts for the cooperative get one notice that drafts are waiting. */
  private async tellReviewers(mamcosId: string, n: number) {
    const users = await this.prisma.user.findMany({
      where: {
        mamcosId, isActive: true,
        OR: [
          { role: { in: ['MAMCOS_SECRETARY', 'ADMIN'] } },
          { customRole: { isActive: true, permissions: { some: { action: 'CREATE', resource: { key: 'weather' } } } } },
        ],
      },
      select: { id: true },
    });
    for (const u of users) {
      await this.notifications
        .create({ userId: u.id, type: 'WEATHER_DRAFTS', title: 'Weather warnings to review', body: `${n} early-warning draft${n === 1 ? '' : 's'} based on today’s forecast are waiting. Review and send them from the Weather page.`, data: { count: n } })
        .catch(() => undefined);
    }
  }
}

export { alertAreaKey };
