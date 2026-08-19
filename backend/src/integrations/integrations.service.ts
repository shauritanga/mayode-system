import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarTaskStatus, ActivityType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OwnershipService,
  RequestUser,
} from '../common/ownership.service';
import { MembershipsService } from '../memberships/memberships.service';
import { CreateAiIntegrationRecordDto } from './dto/ai-integration-record.dto';
import {
  enrichRiceSorter,
  enrichSoilTester,
  farmSoilPatchFromTest,
  RICE_SORTER_SCHEMA,
  SOIL_TESTER_SCHEMA,
  type SoilPayload,
} from './ai-enrichment';

/** Stable product IDs for MAYODE AI / equipment integrations. */
export const AI_SOURCE_TYPES = [
  'FIELD_ADVISORY',
  'SOIL_TESTER',
  'DRONE_REPORT',
  'RICE_SORTER',
  'QR_TRACEABILITY',
  'LOGISTICS_OPTIMIZER',
] as const;

export type AiSourceType = (typeof AI_SOURCE_TYPES)[number];

const FIELD_ADVISORY_SCHEMA = 'mayode.field-advisory.v1';
const QR_TRACEABILITY_SCHEMA = 'mayode.qr_traceability.v1';

type Finding = {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly memberships: MembershipsService,
  ) {}

  private async assertReferences(dto: CreateAiIntegrationRecordDto) {
    const checks: Promise<void>[] = [];
    if (dto.farmId) {
      checks.push(
        this.prisma.farm
          .findUnique({ where: { id: dto.farmId }, select: { id: true } })
          .then((record) => {
            if (!record)
              throw new NotFoundException(
                `Farm with ID ${dto.farmId} not found`,
              );
          }),
      );
    }
    if (dto.cropCycleId) {
      checks.push(
        this.prisma.cropCycle
          .findUnique({
            where: { id: dto.cropCycleId },
            select: { id: true },
          })
          .then((record) => {
            if (!record)
              throw new NotFoundException(
                `Crop cycle with ID ${dto.cropCycleId} not found`,
              );
          }),
      );
    }
    if (dto.lotId) {
      checks.push(
        this.prisma.lot
          .findUnique({ where: { id: dto.lotId }, select: { id: true } })
          .then((record) => {
            if (!record)
              throw new NotFoundException(`Lot with ID ${dto.lotId} not found`);
          }),
      );
    }
    await Promise.all(checks);
  }

  async create(dto: CreateAiIntegrationRecordDto, user: RequestUser) {
    await this.assertReferences(dto);

    let farmId = dto.farmId;
    let lotId = dto.lotId;
    let payload = { ...(dto.payload || {}) } as Record<string, unknown>;
    let recommendation =
      dto.recommendation && typeof dto.recommendation === 'object'
        ? ({ ...dto.recommendation } as Record<string, unknown>)
        : undefined;

    if (lotId) {
      const lot = await this.prisma.lot.findUnique({
        where: { id: lotId },
        include: {
          inventoryRecords: { take: 1, select: { farmId: true } },
        },
      });
      if (!lot) throw new NotFoundException(`Lot with ID ${lotId} not found`);
      const lotFarmId = lot.inventoryRecords[0]?.farmId;
      if (lotFarmId) {
        await this.ownership.assertFarmAccess(user, lotFarmId);
        farmId = farmId || lotFarmId;
      }
    } else if (farmId) {
      await this.ownership.assertFarmAccess(user, farmId);
    } else if (dto.cropCycleId) {
      const cycle = await this.prisma.cropCycle.findUnique({
        where: { id: dto.cropCycleId },
        select: { farmId: true },
      });
      if (cycle) {
        await this.ownership.assertFarmAccess(user, cycle.farmId);
        farmId = farmId || cycle.farmId;
      }
    }

    // Resolve QR tracking code → lot when lotId omitted.
    if (
      dto.sourceType === 'QR_TRACEABILITY' &&
      !lotId &&
      typeof payload.trackingCode === 'string'
    ) {
      const inv = await this.prisma.inventoryRecord.findUnique({
        where: { trackingCode: payload.trackingCode.trim() },
        include: { lot: { select: { id: true } } },
      });
      if (inv?.lot?.id) lotId = inv.lot.id;
      if (inv?.farmId) {
        await this.ownership.assertFarmAccess(user, inv.farmId);
        farmId = farmId || inv.farmId;
      }
      payload = {
        ...payload,
        schema: QR_TRACEABILITY_SCHEMA,
        trackingCode: payload.trackingCode.trim(),
      };
    }

    if (dto.sourceType === 'SOIL_TESTER') {
      const enriched = enrichSoilTester(payload, recommendation);
      payload = enriched.payload as Record<string, unknown>;
      recommendation = enriched.recommendation;
      if (farmId && (payload as SoilPayload).syncFarmSoil !== false) {
        await this.syncFarmSoilFromTest(farmId, payload as SoilPayload);
      }
    }

    if (dto.sourceType === 'RICE_SORTER') {
      const enriched = enrichRiceSorter(payload, recommendation);
      payload = enriched.payload as Record<string, unknown>;
      recommendation = enriched.recommendation;
      if (lotId) {
        await this.applySorterQualityToLot(lotId, payload);
      }
    }

    // External model hook: preserve provider/version on any source type.
    if (payload.modelProvider || payload.modelVersion) {
      payload = {
        ...payload,
        externalModel: {
          provider: payload.modelProvider ?? null,
          version: payload.modelVersion ?? null,
          hookedAt: new Date().toISOString(),
        },
      };
    }

    return this.prisma.aiIntegrationRecord.create({
      data: {
        sourceType: dto.sourceType,
        farmId,
        cropCycleId: dto.cropCycleId,
        lotId,
        externalReference: dto.externalReference,
        payload: payload as Prisma.InputJsonValue,
        recommendation: recommendation as Prisma.InputJsonValue,
        capturedByUserId: user.id,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
      },
      include: {
        farm: { select: { id: true, farmCode: true, name: true } },
        cropCycle: { select: { id: true, season: true, riceVariety: true } },
        lot: { select: { id: true, lotNumber: true } },
      },
    });
  }

  private async syncFarmSoilFromTest(farmId: string, payload: SoilPayload) {
    const patch = farmSoilPatchFromTest(payload);
    if (!Object.keys(patch).length) return;
    await this.prisma.farm.update({
      where: { id: farmId },
      data: patch,
    });
  }

  /** Push sorter grade/moisture onto all inventory rows in the lot (traceability source). */
  private async applySorterQualityToLot(
    lotId: string,
    payload: Record<string, unknown>,
  ) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { lotNumber: true },
    });
    if (!lot) return;
    const qualityGrade =
      typeof payload.qualityGrade === 'string' ? payload.qualityGrade : undefined;
    const moisture =
      typeof payload.moisturePct === 'number' ? payload.moisturePct : undefined;
    if (qualityGrade == null && moisture == null) return;
    await this.prisma.inventoryRecord.updateMany({
      where: { lotNumber: lot.lotNumber },
      data: {
        ...(qualityGrade != null ? { qualityGrade } : {}),
        ...(moisture != null ? { moistureContentPct: moisture } : {}),
      },
    });
  }

  /** Latest sorter + soil AI evidence for a lot (sales/traceability). */
  async lotQualityEvidence(lotId: string) {
    const records = await this.prisma.aiIntegrationRecord.findMany({
      where: {
        lotId,
        sourceType: { in: ['RICE_SORTER', 'QR_TRACEABILITY'] },
      },
      orderBy: { capturedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        sourceType: true,
        externalReference: true,
        payload: true,
        recommendation: true,
        capturedAt: true,
      },
    });
    const sorter = records.find((r) => r.sourceType === 'RICE_SORTER');
    const rec =
      sorter?.recommendation && typeof sorter.recommendation === 'object'
        ? (sorter.recommendation as Record<string, unknown>)
        : null;
    const payload =
      sorter?.payload && typeof sorter.payload === 'object'
        ? (sorter.payload as Record<string, unknown>)
        : null;
    return {
      schema: RICE_SORTER_SCHEMA,
      qualityGrade: rec?.qualityGrade ?? payload?.qualityGrade ?? null,
      moisturePct: rec?.moisturePct ?? payload?.moisturePct ?? null,
      summary: rec?.summary ?? null,
      severity: rec?.severity ?? null,
      sorterRecordId: sorter?.id ?? null,
      events: records,
    };
  }

  list(query: {
    sourceType?: string;
    farmId?: string;
    cropCycleId?: string;
    lotId?: string;
  }) {
    return this.prisma.aiIntegrationRecord.findMany({
      where: {
        sourceType: query.sourceType,
        farmId: query.farmId,
        cropCycleId: query.cropCycleId,
        lotId: query.lotId,
      },
      include: {
        farm: { select: { id: true, farmCode: true, name: true } },
        cropCycle: { select: { id: true, season: true, riceVariety: true } },
        lot: { select: { id: true, lotNumber: true } },
      },
      orderBy: { capturedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Farmer-facing list. Full recommendation body requires active membership;
   * free users still see title/severity/severity severity so the CTA is real.
   */
  async listForUser(
    user: RequestUser,
    query: { cropCycleId?: string; farmId?: string; sourceType?: string },
  ) {
    const premium = await this.memberships.hasPremiumAccess(user);
    const records = await this.list(query);

    if (user.role !== UserRole.FARMER) {
      return { locked: false, premium: true, records };
    }

    // Farmers only see records for farms they can access.
    const visible: typeof records = [];
    for (const record of records) {
      const farmId = record.farmId || record.farm?.id;
      if (!farmId) continue;
      try {
        await this.ownership.assertFarmAccess(user, farmId);
        visible.push(record);
      } catch {
        // skip
      }
    }

    if (premium) {
      return { locked: false, premium: true, records: visible };
    }

    return {
      locked: true,
      premium: false,
      message:
        'Activate your MAYOData membership to unlock full field advisories and equipment recommendations.',
      records: visible.map((record) => this.previewRecord(record)),
    };
  }

  private previewRecord(record: Awaited<ReturnType<IntegrationsService['list']>>[number]) {
    const recommendation =
      record.recommendation && typeof record.recommendation === 'object'
        ? (record.recommendation as Record<string, unknown>)
        : null;
    return {
      id: record.id,
      sourceType: record.sourceType,
      farmId: record.farmId,
      cropCycleId: record.cropCycleId,
      lotId: record.lotId,
      externalReference: record.externalReference,
      capturedAt: record.capturedAt,
      farm: record.farm,
      cropCycle: record.cropCycle,
      lot: record.lot,
      payload: { schema: (record.payload as any)?.schema },
      recommendation: recommendation
        ? {
            summary: recommendation.summary ?? null,
            severity: recommendation.severity ?? null,
            locked: true,
          }
        : { locked: true },
    };
  }

  /**
   * First-party AI MVP: rule-based rice season field advisory.
   * Transparent signals (protocol tasks, soil, irrigation, activities) — not fabricated ML.
   */
  async generateFieldAdvisory(cropCycleId: string, user: RequestUser) {
    const cycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      include: {
        farm: {
          select: {
            id: true,
            farmCode: true,
            name: true,
            soilType: true,
            soilCondition: true,
            soilFertility: true,
            hasIrrigation: true,
            waterSource: true,
            district: true,
            region: true,
          },
        },
        activities: {
          select: { activityType: true, activityDate: true },
          orderBy: { activityDate: 'desc' },
          take: 40,
        },
        calendarTasks: {
          select: {
            taskKey: true,
            title: true,
            status: true,
            dueDate: true,
            guidance: true,
          },
        },
        costs: { select: { category: true, totalCost: true } },
      },
    });
    if (!cycle) {
      throw new NotFoundException(`Crop cycle with ID ${cropCycleId} not found`);
    }
    await this.ownership.assertFarmAccess(user, cycle.farmId);

    const latestSoil = await this.prisma.aiIntegrationRecord.findFirst({
      where: { farmId: cycle.farmId, sourceType: 'SOIL_TESTER' },
      orderBy: { capturedAt: 'desc' },
    });

    const now = Date.now();
    const findings: Finding[] = [];
    const actions: string[] = [];

    const overdue = cycle.calendarTasks.filter(
      (t) =>
        t.status === CalendarTaskStatus.PENDING &&
        t.dueDate &&
        t.dueDate.getTime() < now,
    );
    if (overdue.length) {
      findings.push({
        code: 'OVERDUE_PROTOCOL_TASKS',
        severity: overdue.length >= 3 ? 'HIGH' : 'MEDIUM',
        message: `${overdue.length} rice protocol task(s) are overdue (e.g. ${overdue[0].title}).`,
      });
      for (const task of overdue.slice(0, 3)) {
        actions.push(`Complete: ${task.title}${task.guidance ? ` — ${task.guidance}` : ''}`);
      }
    }

    const pendingSoon = cycle.calendarTasks.filter(
      (t) =>
        t.status === CalendarTaskStatus.PENDING &&
        t.dueDate &&
        t.dueDate.getTime() >= now &&
        t.dueDate.getTime() - now <= 7 * 24 * 60 * 60 * 1000,
    );
    if (pendingSoon.length) {
      findings.push({
        code: 'UPCOMING_PROTOCOL_TASKS',
        severity: 'LOW',
        message: `${pendingSoon.length} protocol task(s) due within 7 days.`,
      });
      actions.push(`Prepare for: ${pendingSoon[0].title}`);
    }

    if (latestSoil?.recommendation && typeof latestSoil.recommendation === 'object') {
      const soilRec = latestSoil.recommendation as {
        summary?: string;
        severity?: Finding['severity'];
        actions?: string[];
        findings?: Finding[];
      };
      findings.push({
        code: 'SOIL_TEST_LINKED',
        severity: soilRec.severity || 'MEDIUM',
        message:
          soilRec.summary ||
          `Latest soil test (${SOIL_TESTER_SCHEMA}) has fertilizer guidance.`,
      });
      for (const action of (soilRec.actions || []).slice(0, 2)) {
        actions.push(action);
      }
    } else if (
      !cycle.farm.soilType &&
      !cycle.farm.soilCondition &&
      !cycle.farm.soilFertility
    ) {
      findings.push({
        code: 'MISSING_SOIL_DATA',
        severity: 'MEDIUM',
        message:
          'No soil type/condition on this farm. Log a soil test (SOIL_TESTER) or update farm soil fields.',
      });
      actions.push('Record a soil test or farmer-reported soil condition.');
    }

    if (!cycle.farm.hasIrrigation && !cycle.farm.waterSource) {
      findings.push({
        code: 'WATER_ACCESS_UNKNOWN',
        severity: 'MEDIUM',
        message: 'Irrigation/water source is not recorded — drought risk is harder to manage.',
      });
      actions.push('Confirm water source and irrigation status on the farm profile.');
    }

    const activityTypes = new Set(cycle.activities.map((a) => a.activityType));
    if (
      (cycle.status === 'ACTIVE' || cycle.status === 'PLANNED') &&
      !activityTypes.has(ActivityType.FERTILIZING) &&
      !cycle.costs.some((c) => c.category === 'FERTILIZER')
    ) {
      findings.push({
        code: 'NO_FERTILIZER_SIGNAL',
        severity: 'LOW',
        message:
          'No fertilizer activity or cost logged for this season yet.',
      });
      actions.push('Log fertilizer application when applied, or confirm if none is planned.');
    }

    if (cycle.activities.length === 0 && cycle.status !== 'PLANNED') {
      findings.push({
        code: 'NO_ACTIVITIES',
        severity: 'HIGH',
        message: 'No field activities logged for an active/harvested cycle.',
      });
      actions.push('Log recent field work so advisories and audit trails stay accurate.');
    }

    if (
      cycle.expectedHarvest &&
      cycle.expectedHarvest.getTime() - now <= 14 * 24 * 60 * 60 * 1000 &&
      cycle.expectedHarvest.getTime() - now > 0 &&
      cycle.status !== 'HARVESTED' &&
      cycle.status !== 'COMPLETED'
    ) {
      findings.push({
        code: 'HARVEST_APPROACHING',
        severity: 'HIGH',
        message: 'Expected harvest is within 14 days — prepare drying, bags, and warehouse intake.',
      });
      actions.push(
        'Review harvest readiness (moisture, bags) and book warehouse receipt when ready.',
      );
    }

    if (!findings.length) {
      findings.push({
        code: 'ON_TRACK',
        severity: 'LOW',
        message:
          'No urgent gaps detected from protocol tasks, soil, water, or activity signals.',
      });
      actions.push('Keep logging activities and complete upcoming rice calendar tasks on time.');
    }

    const severityRank = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
    const severity = findings.reduce<"LOW" | "MEDIUM" | "HIGH">(
      (max, f) =>
        severityRank[f.severity] > severityRank[max] ? f.severity : max,
      'LOW',
    );

    const summary =
      severity === 'HIGH'
        ? `Priority field actions needed for ${cycle.farm.farmCode} · ${cycle.season}`
        : severity === 'MEDIUM'
          ? `Season watch-outs for ${cycle.farm.farmCode} · ${cycle.season}`
          : `Season looks on track for ${cycle.farm.farmCode} · ${cycle.season}`;

    const payload = {
      schema: FIELD_ADVISORY_SCHEMA,
      product: 'FIELD_ADVISORY',
      engine: 'mayode.field-advisory.rules.v1',
      cropCycleId: cycle.id,
      farmId: cycle.farmId,
      farmCode: cycle.farm.farmCode,
      season: cycle.season,
      riceVariety: cycle.riceVariety,
      cycleStatus: cycle.status,
      signals: {
        overdueProtocolTasks: overdue.length,
        upcomingProtocolTasks: pendingSoon.length,
        activityCount: cycle.activities.length,
        hasSoilData: Boolean(
          cycle.farm.soilType ||
            cycle.farm.soilCondition ||
            cycle.farm.soilFertility ||
            latestSoil,
        ),
        latestSoilTestId: latestSoil?.id ?? null,
        latestSoilSchema: latestSoil ? SOIL_TESTER_SCHEMA : null,
        hasIrrigation: Boolean(cycle.farm.hasIrrigation),
        hasWaterSource: Boolean(cycle.farm.waterSource),
        fertilizerLogged:
          activityTypes.has(ActivityType.FERTILIZING) ||
          cycle.costs.some((c) => c.category === 'FERTILIZER'),
      },
    };

    const recommendation = {
      schema: FIELD_ADVISORY_SCHEMA,
      summary,
      severity,
      findings,
      actions: [...new Set(actions)].slice(0, 8),
      generatedAt: new Date().toISOString(),
    };

    return this.create(
      {
        sourceType: 'FIELD_ADVISORY',
        farmId: cycle.farmId,
        cropCycleId: cycle.id,
        externalReference: `advisory:${cycle.id}:${Date.now()}`,
        payload,
        recommendation,
      },
      user,
    );
  }

  catalog() {
    return {
      schema: 'mayode.ai-catalog.v1',
      primaryProduct: {
        id: 'FIELD_ADVISORY',
        name: 'Season field advisory',
        status: 'live',
        description:
          'First-party rice season advisory from protocol tasks, soil/water signals, and logged activities. Pulls latest SOIL_TESTER fertilizer guidance when present.',
        recordSchema: FIELD_ADVISORY_SCHEMA,
      },
      intakeProducts: [
        {
          id: 'SOIL_TESTER',
          name: 'Soil tester',
          status: 'live',
          description:
            'Structured pH/OM/N-P-K → fertilizer recommendations; syncs farm soil fields.',
          recordSchema: SOIL_TESTER_SCHEMA,
        },
        {
          id: 'DRONE_REPORT',
          name: 'Drone / imagery report',
          status: 'intake_ready',
        },
        {
          id: 'RICE_SORTER',
          name: 'Rice sorter output',
          status: 'live',
          description:
            'Grade/moisture → inventory lot quality; surfaced on sales traceability.',
          recordSchema: RICE_SORTER_SCHEMA,
        },
        {
          id: 'QR_TRACEABILITY',
          name: 'QR traceability event',
          status: 'live',
          description:
            'Scan/handoff events; resolves tracking code to lot when provided.',
          recordSchema: QR_TRACEABILITY_SCHEMA,
        },
        {
          id: 'LOGISTICS_OPTIMIZER',
          name: 'Logistics optimizer',
          status: 'planned',
        },
      ],
      externalModelHook: {
        status: 'live',
        description:
          'Any intake may include modelProvider + modelVersion on payload; stored under payload.externalModel for partner model wiring.',
      },
    };
  }

  /** Staff-only: reject unknown source types early with a clear message. */
  assertKnownSourceType(sourceType: string) {
    if (!AI_SOURCE_TYPES.includes(sourceType as AiSourceType)) {
      throw new BadRequestException(
        `Unknown sourceType "${sourceType}". Allowed: ${AI_SOURCE_TYPES.join(', ')}`,
      );
    }
  }
}
