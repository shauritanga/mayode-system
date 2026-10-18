import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from './weather.service';
import { adviceFor, summarize, type ForecastDay } from './weather-rules';

/** What to do on each of a farmer's crops this week: the stage of the crop against the forecast for their district. */
@Injectable()
export class WeatherAdviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
  ) {}

  async forFarmerId(farmerId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: {
        region: true, district: true, residenceLatitude: true, residenceLongitude: true, user: { select: { language: true } },
        cropCycles: {
          where: { status: { in: ['ACTIVE', 'PLANNED'] } },
          select: { id: true, season: true, riceVariety: true, growthStage: true, plantingDate: true, farm: { select: { farmCode: true, centerLatitude: true, centerLongitude: true } } },
        },
      },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');
    const cycleWithPoint = farmer.cropCycles.find((c) => c.farm.centerLatitude != null);
    const position = cycleWithPoint
      ? { lat: cycleWithPoint.farm.centerLatitude!, lon: cycleWithPoint.farm.centerLongitude! }
      : farmer.residenceLatitude != null && farmer.residenceLongitude != null ? { lat: farmer.residenceLatitude, lon: farmer.residenceLongitude } : undefined;
    const snap = await this.weather.snapshotFor(farmer.region, farmer.district, position);
    const days = snap ? (snap.days as unknown as ForecastDay[]) : null;
    const summary = days ? summarize(days) : null;
    return {
      language: farmer.user?.language === 'en' ? 'en' : 'sw',
      place: [farmer.district, farmer.region].filter(Boolean).join(', ') || null,
      forecast: days ? { days, summary, fetchedAt: snap!.fetchedAt } : null,
      crops: farmer.cropCycles.map((c) => ({
        id: c.id, season: c.season, variety: c.riceVariety, stage: c.growthStage, farm: c.farm.farmCode, plantingDate: c.plantingDate,
        advice: adviceFor(c.growthStage, summary),
      })),
    };
  }

  async forUser(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId }, select: { id: true } });
    if (!farmer) throw new NotFoundException('Farmer profile not found');
    return this.forFarmerId(farmer.id);
  }
}
