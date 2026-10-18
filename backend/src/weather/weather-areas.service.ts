import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { alertAreaKey, cropCounts, type AreaCrops } from './weather-rules';

export interface WeatherArea {
  areaKey: string;
  mamcosId: string;
  cooperative: string | null;
  region: string | null;
  district: string;
  latitude: number | null;
  longitude: number | null;
  farmers: number;
  crops: AreaCrops;
}

/** The places farmers grow in: each cooperative's farmers by district, with where they are and what stage their crops are at. */
@Injectable()
export class WeatherAreasService {
  constructor(private readonly prisma: PrismaService) {}

  async areas(mamcosId?: string | null): Promise<WeatherArea[]> {
    const scope = mamcosId ? { mamcosId } : { mamcosId: { not: null } };
    const [farmers, cycles, coops] = await Promise.all([
      this.prisma.farmer.findMany({
        where: { ...scope, district: { not: null } },
        select: { mamcosId: true, region: true, district: true, residenceLatitude: true, residenceLongitude: true },
      }),
      this.prisma.cropCycle.findMany({
        where: { status: { in: ['ACTIVE', 'PLANNED'] }, farmer: { ...scope, district: { not: null } } },
        select: {
          growthStage: true,
          farm: { select: { centerLatitude: true, centerLongitude: true } },
          farmer: { select: { mamcosId: true, region: true, district: true } },
        },
      }),
      this.prisma.mamcos.findMany({ select: { id: true, name: true } }),
    ]);
    const names = new Map(coops.map((c) => [c.id, c.name]));
    type Acc = { mamcosId: string; region: string | null; district: string; farmers: number; points: [number, number][]; stages: (string | null)[] };
    const map = new Map<string, Acc>();
    const get = (m: string, r: string | null, d: string) => {
      const key = alertAreaKey(m, r, d);
      let a = map.get(key);
      if (!a) { a = { mamcosId: m, region: r, district: d, farmers: 0, points: [], stages: [] }; map.set(key, a); }
      return a;
    };
    for (const f of farmers) {
      const a = get(f.mamcosId!, f.region, f.district!);
      a.farmers += 1;
      if (f.residenceLatitude != null && f.residenceLongitude != null) a.points.push([f.residenceLatitude, f.residenceLongitude]);
    }
    for (const c of cycles) {
      const a = get(c.farmer.mamcosId!, c.farmer.region, c.farmer.district!);
      a.stages.push(c.growthStage);
      if (c.farm.centerLatitude != null && c.farm.centerLongitude != null) a.points.push([c.farm.centerLatitude, c.farm.centerLongitude]);
    }
    return [...map.entries()].map(([areaKey, a]) => ({
      areaKey,
      mamcosId: a.mamcosId,
      cooperative: names.get(a.mamcosId) ?? null,
      region: a.region,
      district: a.district,
      latitude: a.points.length ? a.points.reduce((t, p) => t + p[0], 0) / a.points.length : null,
      longitude: a.points.length ? a.points.reduce((t, p) => t + p[1], 0) / a.points.length : null,
      farmers: a.farmers,
      crops: cropCounts(a.stages),
    }));
  }
}
