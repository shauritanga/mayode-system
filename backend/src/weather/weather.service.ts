import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService, normalizeMsisdn } from '../messaging/sms.service';
import { CreateWeatherAlertDto } from './dto/weather.dto';

interface OpenMeteoResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

const FLOOD_RISK_MM = 60; // 7-day cumulative rainfall above this is flagged for flood risk
const DROUGHT_RISK_DAYS_DRY = 5; // consecutive near-zero-rain days flagged for drought risk

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Live 7-day forecast from Open-Meteo (free, no API key required —
   * https://open-meteo.com). Derives flood/drought risk flags and a
   * planting/irrigation recommendation from the real precipitation data
   * rather than fabricating advice.
   */
  async getForecast(lat: number, lon: number) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Africa%2FDar_es_Salaam`;
    let data: OpenMeteoResponse;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
      data = (await response.json()) as OpenMeteoResponse;
    } catch (error) {
      this.logger.error(`Weather forecast fetch failed: ${(error as Error).message}`);
      throw new BadGatewayException('Unable to reach the weather forecast provider right now.');
    }

    const days = data.daily.time.map((date, i) => ({
      date,
      maxTempC: data.daily.temperature_2m_max[i],
      minTempC: data.daily.temperature_2m_min[i],
      precipitationMm: data.daily.precipitation_sum[i],
    }));

    const totalPrecipitationMm = days.reduce((sum, d) => sum + (d.precipitationMm || 0), 0);
    let consecutiveDryDays = 0;
    let maxConsecutiveDryDays = 0;
    for (const d of days) {
      if ((d.precipitationMm || 0) < 1) {
        consecutiveDryDays += 1;
        maxConsecutiveDryDays = Math.max(maxConsecutiveDryDays, consecutiveDryDays);
      } else {
        consecutiveDryDays = 0;
      }
    }

    const floodRisk = totalPrecipitationMm >= FLOOD_RISK_MM;
    const droughtRisk = maxConsecutiveDryDays >= DROUGHT_RISK_DAYS_DRY;

    const recommendations: string[] = [];
    if (floodRisk) recommendations.push('High rainfall expected this week — inspect field drainage and delay fertilizer application.');
    if (droughtRisk) recommendations.push('Extended dry spell expected — plan supplemental irrigation if available.');
    if (!floodRisk && !droughtRisk) recommendations.push('Rainfall outlook is moderate — normal planting/irrigation schedule can proceed.');

    return {
      source: 'open-meteo.com',
      latitude: lat,
      longitude: lon,
      days,
      totalPrecipitationMm,
      floodRisk,
      droughtRisk,
      recommendations,
    };
  }

  async createAlert(issuedById: string, dto: CreateWeatherAlertDto) {
    const alert = await this.prisma.weatherAlert.create({
      data: {
        region: dto.region,
        district: dto.district,
        ward: dto.ward,
        alertType: dto.alertType,
        severity: dto.severity,
        title: dto.title,
        message: dto.message,
        issuedById,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });

    // Broadcast via SMS to farmers in the affected area (reuses the same
    // best-effort SmsService every other feature uses — never throws, logs
    // to SmsLog even in simulated/no-credentials mode).
    const farmers = await this.prisma.farmer.findMany({
      where: {
        ...(dto.region ? { region: dto.region } : {}),
        ...(dto.district ? { district: dto.district } : {}),
        ...(dto.ward ? { ward: dto.ward } : {}),
      },
      select: { user: { select: { phone: true } } },
    });

    let sent = 0;
    for (const farmer of farmers) {
      if (!farmer.user?.phone) continue;
      await this.sms.send(normalizeMsisdn(farmer.user.phone), `MAYODE ALERT (${dto.alertType}): ${dto.title} — ${dto.message}`, 'weather_alert');
      sent += 1;
    }

    return this.prisma.weatherAlert.update({
      where: { id: alert.id },
      data: { smsSentCount: sent },
    });
  }

  findAllAlerts() {
    return this.prisma.weatherAlert.findMany({ orderBy: { validFrom: 'desc' } });
  }
}
