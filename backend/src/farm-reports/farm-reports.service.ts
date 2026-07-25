import { Injectable, NotFoundException } from '@nestjs/common';
import { FarmGrade } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipsService } from '../memberships/memberships.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AddFarmPhotoDto, CreateFieldSurveyDto } from './dto/farm-reports.dto';

// Grade-based heuristics for the analytics report (documented as estimates).
const YIELD_PER_ACRE_KG: Record<FarmGrade, number> = { A: 2200, B: 1800, C: 1400 };
const LAND_VALUE_PER_ACRE_TZS: Record<FarmGrade, number> = {
  A: 3_500_000,
  B: 2_500_000,
  C: 1_800_000,
};

@Injectable()
export class FarmReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly memberships: MembershipsService,
  ) {}

  // ----------------------------------------------------------------- photos

  async addPhoto(farmId: string, dto: AddFarmPhotoDto, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, farmId);
    return this.prisma.farmPhoto.create({
      data: {
        farmId,
        url: dto.url,
        caption: dto.caption,
        latitude: dto.latitude,
        longitude: dto.longitude,
        uploadedById: user.id,
      },
    });
  }

  async listPhotos(farmId: string) {
    return this.prisma.farmPhoto.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deletePhoto(photoId: string, user: RequestUser) {
    const photo = await this.prisma.farmPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.ownership.assertFarmAccess(user, photo.farmId);
    return this.prisma.farmPhoto.delete({ where: { id: photoId } });
  }

  // ---------------------------------------------------------- field surveys

  /** Field officers/admins record on-site farm data (staff-guarded in the controller). */
  async createFieldSurvey(farmId: string, dto: CreateFieldSurveyDto, user: RequestUser) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
    if (!farm) throw new NotFoundException(`Farm ${farmId} not found`);
    return this.prisma.farmFieldSurvey.create({
      data: { farmId, surveyedById: user.id, ...dto },
    });
  }

  async listFieldSurveys(farmId: string) {
    return this.prisma.farmFieldSurvey.findMany({
      where: { farmId },
      orderBy: { surveyDate: 'desc' },
    });
  }

  // ------------------------------------------------------------- the report

  private async assembleReport(farmId: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        mamcos: { select: { name: true } },
        photos: { orderBy: { createdAt: 'desc' } },
        fieldSurveys: { orderBy: { surveyDate: 'desc' }, take: 1 },
        cropCycles: { select: { actualYieldKg: true, status: true } },
      },
    });
    if (!farm) throw new NotFoundException(`Farm ${farmId} not found`);

    const acres = farm.actualAcres ?? (farm.socialHectares ? farm.socialHectares * 2.47105 : 0);
    const survey = farm.fieldSurveys[0] ?? null;

    const potentialYieldKg = Math.round(YIELD_PER_ACRE_KG[farm.grade] * acres);
    const estimatedValueTzs = Math.round(LAND_VALUE_PER_ACRE_TZS[farm.grade] * acres);
    const actualYieldKg = farm.cropCycles.reduce((s, c) => s + (c.actualYieldKg ?? 0), 0);

    const recommendations: string[] = [];
    if (survey?.soilPh != null) {
      if (survey.soilPh < 5.5) recommendations.push('Soil is acidic (pH < 5.5). Consider agricultural lime before planting.');
      else if (survey.soilPh > 7.5) recommendations.push('Soil is alkaline (pH > 7.5). Use acidifying inputs and monitor micronutrients.');
    } else {
      recommendations.push('No soil test on record. Request a MAYODE field soil assessment.');
    }
    if (survey?.roadAccessQuality === 'POOR') recommendations.push('Road access is poor — plan harvest transport early to reduce post-harvest loss.');
    if (!farm.hasIrrigation && (!survey?.waterSource)) recommendations.push('No irrigation or water source recorded — assess water access for the dry season.');
    if (!farm.centerLatitude) recommendations.push('Farm is not GPS-mapped yet. Capture the boundary to unlock mapping-based analytics.');
    if (farm.photos.length < 3) recommendations.push('Add at least 3 farm photos to complete the farm profile.');

    let condition = 'Fair';
    if (farm.grade === 'A' && farm.hasIrrigation) condition = 'Good';
    else if (farm.grade === 'C' || survey?.floodRisk === 'High') condition = 'Needs attention';

    return {
      farm,
      acres: Number(acres.toFixed(2)),
      survey,
      potentialYieldKg,
      estimatedValueTzs,
      actualYieldKg,
      condition,
      recommendations,
    };
  }

  /** Basic, non-premium slice safe to show free users. */
  private basicReport(r: Awaited<ReturnType<FarmReportsService['assembleReport']>>) {
    const f = r.farm;
    return {
      farmId: f.id,
      farmCode: f.farmCode,
      name: f.name,
      location: [f.village, f.ward, f.district, f.region, f.mamcos?.name].filter(Boolean).join(', '),
      sizeHectares: f.socialHectares,
      sizeAcres: r.acres,
      grade: f.grade,
      mapped: Boolean(f.centerLatitude),
      photoCount: f.photos.length,
    };
  }

  /**
   * Comprehensive farm-analytics report (owner comment §2.5). Premium-gated:
   * free users get the basic slice plus a membership CTA; the full report
   * (soil, yield, value, recommendations) requires an active membership.
   */
  async getReport(farmId: string, user: RequestUser) {
    const r = await this.assembleReport(farmId);
    const basic = this.basicReport(r);

    if (!(await this.memberships.hasPremiumAccess(user))) {
      return {
        locked: true,
        code: 'MEMBERSHIP_REQUIRED',
        ...basic,
        message:
          'Activate your MAYOData membership to unlock the full farm analytics report — soil, yield potential, estimated value and recommendations.',
      };
    }

    const f = r.farm;
    return {
      locked: false,
      ...basic,
      gps: f.centerLatitude ? { latitude: f.centerLatitude, longitude: f.centerLongitude } : null,
      photos: f.photos.map((p) => ({ url: p.url, caption: p.caption })),
      soil: r.survey
        ? {
            ph: r.survey.soilPh,
            texture: r.survey.soilTexture,
            organicMatter: r.survey.soilOrganicMatter,
            notes: r.survey.soilNotes,
            source: r.survey.source,
          }
        : (f.soilType || f.soilCondition ? { type: f.soilType, condition: f.soilCondition, source: 'FARMER_REPORTED' } : null),
      roadAccess: r.survey
        ? { distanceMeters: r.survey.roadDistanceMeters, quality: r.survey.roadAccessQuality }
        : { nearRoad: f.nearRoad },
      waterAccess: r.survey
        ? { source: r.survey.waterSource, distanceMeters: r.survey.waterDistanceMeters, reliability: r.survey.waterReliability }
        : { source: f.waterSource, hasIrrigation: f.hasIrrigation },
      condition: r.condition,
      potentialYieldKg: r.potentialYieldKg,
      actualYieldKg: r.actualYieldKg,
      estimatedValueTzs: r.estimatedValueTzs,
      recommendations: r.recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Printable HTML version of the full report (same premium gate). */
  async getReportHtml(farmId: string, user: RequestUser): Promise<string> {
    const report = await this.getReport(farmId, user);
    return renderReportHtml(report);
  }
}

/** Minimal, self-contained printable HTML — no external assets. */
function renderReportHtml(r: any): string {
  const esc = (v: unknown) =>
    String(v ?? '—').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const tzs = (v: number) => `TZS ${Number(v).toLocaleString()}`;

  if (r.locked) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Farm report — ${esc(r.farmCode)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#111">
<h1>${esc(r.name)} <small style="color:#6b7280">${esc(r.farmCode)}</small></h1>
<p>${esc(r.location)} · ${esc(r.sizeAcres)} acres · Grade ${esc(r.grade)}</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin-top:20px">
<strong style="color:#92400e">Membership required</strong>
<p style="color:#92400e">${esc(r.message)}</p></div></body></html>`;
  }

  const rows = (r.recommendations ?? []).map((x: string) => `<li>${esc(x)}</li>`).join('');
  const photos = (r.photos ?? []).map((p: any) => `<div style="font-size:12px;color:#6b7280">📷 ${esc(p.caption || p.url)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Farm analytics report — ${esc(r.farmCode)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 24px;color:#111">
<div style="border-bottom:3px solid #10b981;padding-bottom:12px;margin-bottom:20px">
<h1 style="margin:0">${esc(r.name)}</h1>
<div style="color:#6b7280">${esc(r.farmCode)} · ${esc(r.location)}</div></div>

<h3>Overview</h3>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#6b7280">Farm size</td><td>${esc(r.sizeHectares)} ha (${esc(r.sizeAcres)} acres)</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Grade</td><td>${esc(r.grade)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Condition</td><td>${esc(r.condition)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">GPS mapped</td><td>${r.mapped ? 'Yes' : 'No'}</td></tr>
</table>

<h3>Yield &amp; value (estimates)</h3>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#6b7280">Potential yield</td><td>${esc(r.potentialYieldKg)} kg</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Recorded yield</td><td>${esc(r.actualYieldKg)} kg</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Estimated land value</td><td>${tzs(r.estimatedValueTzs)}</td></tr>
</table>

<h3>Soil</h3>
<div>${r.soil ? esc(JSON.stringify(r.soil)) : 'No soil data on record.'}</div>
<h3>Access</h3>
<div>Road: ${esc(JSON.stringify(r.roadAccess))}</div>
<div>Water: ${esc(JSON.stringify(r.waterAccess))}</div>

<h3>Photos (${(r.photos ?? []).length})</h3>${photos || '<div style="color:#6b7280">No photos.</div>'}

<h3>Recommendations</h3><ul>${rows || '<li>No recommendations.</li>'}</ul>

<p style="color:#9ca3af;font-size:12px;margin-top:24px">Generated by MAYOData · ${esc(r.generatedAt)}. Yield and value are model estimates, not guarantees.</p>
</body></html>`;
}
