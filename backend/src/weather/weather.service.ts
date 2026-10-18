import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { summarize, type ForecastDay } from './weather-rules';

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
const SNAPSHOT_FRESH_MS = 6 * 3_600_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly rainfallCache = new Map<string, { at: number; data: unknown }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Daily temperature and rain from Open-Meteo (free, no key: https://open-meteo.com). */
  async fetchDaily(lat: number, lon: number, pastDays = 0): Promise<ForecastDay[]> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Africa%2FDar_es_Salaam${pastDays ? `&past_days=${pastDays}` : ''}`;
    let data: OpenMeteoResponse;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
      data = (await response.json()) as OpenMeteoResponse;
    } catch (error) {
      this.logger.error(`Weather forecast fetch failed: ${(error as Error).message}`);
      throw new BadGatewayException('Unable to reach the weather forecast provider right now.');
    }
    return data.daily.time.map((date, i) => ({
      date,
      maxTempC: data.daily.temperature_2m_max[i],
      minTempC: data.daily.temperature_2m_min[i],
      precipitationMm: data.daily.precipitation_sum[i],
    }));
  }

  /** Live 7-day forecast with flood and drought flags for a coordinate. */
  async getForecast(lat: number, lon: number) {
    const days = await this.fetchDaily(lat, lon);
    return this.describe(days, { latitude: lat, longitude: lon, live: true });
  }

  private describe(days: ForecastDay[], extra: Record<string, unknown>) {
    const s = summarize(days);
    const floodRisk = s.totalMm >= FLOOD_RISK_MM;
    const droughtRisk = s.maxDryRun >= DROUGHT_RISK_DAYS_DRY;
    const recommendations: string[] = [];
    if (floodRisk) recommendations.push('High rainfall expected this week — inspect field drainage and delay fertilizer application.');
    if (droughtRisk) recommendations.push('Extended dry spell expected — plan supplemental irrigation if available.');
    if (!floodRisk && !droughtRisk) recommendations.push('Rainfall outlook is moderate — normal planting/irrigation schedule can proceed.');
    return {
      source: 'Open-Meteo',
      provider: 'Open-Meteo',
      providerUrl: 'https://open-meteo.com',
      ...extra,
      days,
      totalPrecipitationMm: s.totalMm,
      summary: s,
      floodRisk,
      droughtRisk,
      recommendations,
    };
  }

  // ---------- area snapshots (shared by apps, USSD and the daily check) ----------

  async refreshSnapshot(region: string | null, district: string | null, lat: number, lon: number) {
    const days = await this.fetchDaily(lat, lon);
    const areaKey = `${region ?? ''}|${district ?? ''}`;
    return this.prisma.weatherSnapshot.upsert({
      where: { areaKey },
      create: { areaKey, region, district, latitude: lat, longitude: lon, days: days as never, fetchedAt: new Date() },
      update: { latitude: lat, longitude: lon, days: days as never, fetchedAt: new Date() },
    });
  }

  /** The stored forecast for a place, refreshed when older than six hours and a position is known. */
  async snapshotFor(region: string | null, district: string | null, position?: { lat: number; lon: number }) {
    const areaKey = `${region ?? ''}|${district ?? ''}`;
    const snap = await this.prisma.weatherSnapshot.findUnique({ where: { areaKey } });
    const stale = !snap || Date.now() - snap.fetchedAt.getTime() > SNAPSHOT_FRESH_MS;
    if (stale && (position || snap)) {
      try {
        return await this.refreshSnapshot(region, district, position?.lat ?? snap!.latitude, position?.lon ?? snap!.longitude);
      } catch {
        return snap; // keep serving the last good forecast
      }
    }
    return snap;
  }

  async placeOutlook(region: string | null, district: string | null) {
    const snap = await this.snapshotFor(region, district);
    if (!snap) return null;
    const days = snap.days as unknown as ForecastDay[];
    return this.describe(days, { latitude: snap.latitude, longitude: snap.longitude, live: false, fetchedAt: snap.fetchedAt, region: snap.region, district: snap.district });
  }

  // ---------- rainfall history ----------

  /** The last 30 days of rain against the same 30 days in each of the past three years. */
  async rainfall(lat: number, lon: number) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = this.rainfallCache.get(key);
    if (cached && Date.now() - cached.at < 6 * 3_600_000) return cached.data;

    const recent = (await this.fetchDaily(lat, lon, 30)).filter((d) => d.date <= new Date().toISOString().slice(0, 10));
    const past30 = recent.slice(-30);
    const today = new Date();
    const years: { year: number; mm: number }[] = [];
    for (let back = 1; back <= 3; back += 1) {
      const end = new Date(today); end.setUTCFullYear(end.getUTCFullYear() - back);
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
      try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}&daily=precipitation_sum&timezone=Africa%2FDar_es_Salaam`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { daily: { precipitation_sum: (number | null)[] } };
        years.push({ year: end.getUTCFullYear(), mm: r1(j.daily.precipitation_sum.reduce<number>((t, v) => t + (v ?? 0), 0)) });
      } catch (e) {
        this.logger.warn(`Rainfall archive ${back}y back failed: ${(e as Error).message}`);
      }
    }
    const last30Mm = r1(past30.reduce((t, d) => t + (d.precipitationMm ?? 0), 0));
    const last7Mm = r1(past30.slice(-7).reduce((t, d) => t + (d.precipitationMm ?? 0), 0));
    const avg = years.length ? r1(years.reduce((t, y) => t + y.mm, 0) / years.length) : null;
    const data = {
      latitude: lat,
      longitude: lon,
      last7Mm,
      last30Mm,
      previousYears: years,
      averagePreviousMm: avg,
      comparisonPct: avg && avg > 0 ? Math.round(((last30Mm - avg) / avg) * 100) : null,
      daily: past30.map((d) => ({ date: d.date, mm: d.precipitationMm ?? 0, maxTempC: d.maxTempC })),
    };
    this.rainfallCache.set(key, { at: Date.now(), data });
    return data;
  }
}
