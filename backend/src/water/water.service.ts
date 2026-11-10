import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { localDate } from '../accounting/tax';
import { scheduledDays } from '../payroll/payroll-compliance';
import { CreateScheduleDto, CreateWaterLogDto, ResolveIssueDto, UpdateScheduleDto } from './dto/water.dto';

const day = (v: string | Date) => new Date(`${(typeof v === 'string' ? v : v.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const today = () => day(localDate(new Date()));
export const ISSUE_TYPES = ['LEAK', 'SHORTAGE', 'DISPUTE', 'BLOCKAGE', 'OTHER'] as const;

/**
 * The water register: when water is meant to run on each canal and block, what the gate openers and chairmen actually logged,
 * and the water issues they report. Stipends of gate openers and chairmen are checked against it.
 */
@Injectable()
export class WaterService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService, private readonly scopeService: IrrigationScopeService) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only work with the water register of your own cooperative');
    return id;
  }

  /** Canals and blocks, and the gate openers, the water screens offer. Needs no irrigation permission. */
  async structure(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    const [canals, blocks, openers] = await Promise.all([
      this.prisma.irrigationCanal.findMany({ where: { scheme: { mamcosId }, archivedAt: null, ...this.scopeService.canalWhere(scope) }, orderBy: { canalNumber: 'asc' }, select: { id: true, code: true, name: true, status: true } }),
      this.prisma.irrigationBlock.findMany({ where: { AND: [this.scopeService.blockWhere(scope), { archivedAt: null, canal: { scheme: { mamcosId } } }] }, orderBy: [{ canal: { canalNumber: 'asc' } }, { blockNumber: 'asc' }], select: { id: true, code: true, canalId: true } }),
      this.prisma.payrollPayee.findMany({ where: { mamcosId, isActive: true, compliance: 'WATER_LOG' }, select: { id: true, workerCode: true, fullName: true, user: { select: { firstName: true, lastName: true } } } }),
    ]);
    return { canals, blocks, gateOpeners: openers.map((o) => ({ id: o.id, workerCode: o.workerCode, name: o.fullName ?? `${o.user?.firstName ?? ''} ${o.user?.lastName ?? ''}`.trim() })) };
  }

  // ───────────────────────── schedules ─────────────────────────

  async schedules(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    const canals = await this.prisma.irrigationCanal.findMany({ where: { scheme: { mamcosId }, ...this.scopeService.canalWhere(scope) }, select: { id: true, code: true } });
    const rows = await this.prisma.waterSchedule.findMany({ where: { mamcosId, canalId: { in: canals.map((c) => c.id) } }, orderBy: [{ isActive: 'desc' }, { startsOn: 'desc' }] });
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { id: { in: rows.flatMap((r) => (r.blockId ? [r.blockId] : [])) } }, select: { id: true, code: true } });
    const openers = await this.prisma.payrollPayee.findMany({ where: { id: { in: rows.flatMap((r) => (r.gateOpenerPayeeId ? [r.gateOpenerPayeeId] : [])) } }, select: { id: true, fullName: true, workerCode: true, user: { select: { firstName: true, lastName: true } } } });
    const code = new Map(canals.map((c) => [c.id, c.code])); const bcode = new Map(blocks.map((b) => [b.id, b.code]));
    const oname = new Map(openers.map((o) => [o.id, o.fullName ?? `${o.user?.firstName ?? ''} ${o.user?.lastName ?? ''}`.trim()]));
    return { data: rows.map((r) => ({ id: r.id, canal: { id: r.canalId, code: code.get(r.canalId) ?? '' }, block: r.blockId ? { id: r.blockId, code: bcode.get(r.blockId) ?? '' } : null, weekdays: r.weekdays, startsOn: r.startsOn, endsOn: r.endsOn, gateOpener: r.gateOpenerPayeeId ? { id: r.gateOpenerPayeeId, name: oname.get(r.gateOpenerPayeeId) ?? '' } : null, note: r.note, isActive: r.isActive })) };
  }

  /** A chairman sees the log of their own canal or block only. */
  private visible(scope: { restricted: boolean; canalIds: string[]; blockIds: string[] }) {
    return scope.restricted ? { OR: [{ canalId: { in: scope.canalIds } }, { blockId: { in: scope.blockIds } }] } : {};
  }

  private async checkPlace(mamcosId: string, canalId: string, blockId?: string | null) {
    const canal = await this.prisma.irrigationCanal.findFirst({ where: { id: canalId, scheme: { mamcosId } }, select: { id: true } });
    if (!canal) throw new NotFoundException('Canal not found');
    if (blockId && !(await this.prisma.irrigationBlock.findFirst({ where: { id: blockId, canalId }, select: { id: true } }))) throw new BadRequestException('That block is not on this canal');
  }

  private async checkOpener(mamcosId: string, payeeId?: string | null) {
    if (!payeeId) return;
    const p = await this.prisma.payrollPayee.findFirst({ where: { id: payeeId, mamcosId, isActive: true }, select: { compliance: true } });
    if (!p) throw new NotFoundException('Gate opener not found');
    if (p.compliance !== 'WATER_LOG') throw new BadRequestException('This person is not a gate opener: give them the Water Gate Opener job title first');
  }

  async createSchedule(actor: RequestUser, dto: CreateScheduleDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.checkPlace(mamcosId, dto.canalId, dto.blockId);
    await this.checkOpener(mamcosId, dto.gateOpenerPayeeId);
    const weekdays = [...new Set(dto.weekdays)].sort();
    if (!weekdays.length) throw new BadRequestException('Choose the days water runs');
    const startsOn = dto.startsOn ? day(dto.startsOn) : today();
    const endsOn = dto.endsOn ? day(dto.endsOn) : null;
    if (endsOn && endsOn < startsOn) throw new BadRequestException('The schedule cannot end before it starts');
    return this.prisma.waterSchedule.create({ data: { mamcosId, canalId: dto.canalId, blockId: dto.blockId ?? null, weekdays, startsOn, endsOn, gateOpenerPayeeId: dto.gateOpenerPayeeId ?? null, note: dto.note?.trim() || null, createdById: actor.id } });
  }

  async updateSchedule(actor: RequestUser, id: string, dto: UpdateScheduleDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const s = await this.prisma.waterSchedule.findFirst({ where: { id, mamcosId } });
    if (!s) throw new NotFoundException('Schedule not found');
    await this.checkOpener(mamcosId, dto.gateOpenerPayeeId);
    const weekdays = dto.weekdays ? [...new Set(dto.weekdays)].sort() : undefined;
    if (weekdays && !weekdays.length) throw new BadRequestException('Choose the days water runs');
    return this.prisma.waterSchedule.update({ where: { id }, data: { ...(weekdays ? { weekdays } : {}), ...(dto.endsOn ? { endsOn: day(dto.endsOn) } : {}), ...(dto.gateOpenerPayeeId !== undefined ? { gateOpenerPayeeId: dto.gateOpenerPayeeId } : {}), ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}), ...(dto.isActive != null ? { isActive: dto.isActive } : {}) } });
  }

  // ───────────────────────── the log ─────────────────────────

  /** A chairman (their own canal or block only), a field officer or the office records what happened at a gate. */
  async log(actor: RequestUser, dto: CreateWaterLogDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    const canal = await this.scopeService.assertCanal(scope, dto.canalId);
    if (canal.scheme.mamcosId !== mamcosId) throw new NotFoundException('Canal not found');
    if (dto.blockId) {
      const block = await this.scopeService.assertBlock(scope, dto.blockId);
      if (block.canalId !== canal.id) throw new BadRequestException('That block is not on this canal');
    } else if (scope.restricted && !scope.canalIds.includes(canal.id)) {
      throw new ForbiddenException('Choose your block: you can only log water for the canal or block you lead');
    }
    await this.checkOpener(mamcosId, dto.gateOpenerPayeeId);
    const date = dto.date ? day(dto.date) : today();
    if (date > today()) throw new BadRequestException('You cannot log a day that has not happened');
    if (date < new Date(today().getTime() - 7 * 86_400_000)) throw new BadRequestException('A water log can be entered up to a week late, not longer');
    if (dto.issueType && !(ISSUE_TYPES as readonly string[]).includes(dto.issueType)) throw new BadRequestException('Choose a kind of water issue');
    if (dto.issueType && !dto.issueNote?.trim()) throw new BadRequestException('Describe the water issue');
    const opened = dto.openedAt ? new Date(dto.openedAt) : null; const closed = dto.closedAt ? new Date(dto.closedAt) : null;
    if (opened && closed && closed < opened) throw new BadRequestException('The gate cannot close before it opens');
    return this.prisma.waterLog.create({
      data: {
        mamcosId, canalId: canal.id, blockId: dto.blockId ?? null, date, openedAt: opened, closedAt: closed, gateOpenerPayeeId: dto.gateOpenerPayeeId ?? null, loggedById: actor.id, note: dto.note?.trim() || null,
        ...(dto.issueType ? { issueType: dto.issueType, issueNote: dto.issueNote!.trim(), issueStatus: 'OPEN' } : {}),
      },
    });
  }

  async logs(actor: RequestUser, q: { from?: string; to?: string; canalId?: string; issues?: string }, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    const canals = await this.prisma.irrigationCanal.findMany({ where: { scheme: { mamcosId }, ...this.scopeService.canalWhere(scope), ...(q.canalId ? { id: q.canalId } : {}) }, select: { id: true, code: true } });
    const from = q.from ? day(q.from) : new Date(today().getTime() - 14 * 86_400_000);
    const rows = await this.prisma.waterLog.findMany({
      where: { mamcosId, canalId: { in: canals.map((c) => c.id) }, date: { gte: from, ...(q.to ? { lte: day(q.to) } : {}) }, ...(q.issues === 'open' ? { issueStatus: 'OPEN' } : q.issues === 'all' ? { issueType: { not: null } } : {}), ...this.visible(scope) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200,
    });
    const code = new Map(canals.map((c) => [c.id, c.code]));
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { id: { in: rows.flatMap((r) => (r.blockId ? [r.blockId] : [])) } }, select: { id: true, code: true } });
    const bcode = new Map(blocks.map((b) => [b.id, b.code]));
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.loggedById) } }, select: { id: true, firstName: true, lastName: true, phone: true } });
    const uname = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone]));
    const openers = await this.prisma.payrollPayee.findMany({ where: { id: { in: rows.flatMap((r) => (r.gateOpenerPayeeId ? [r.gateOpenerPayeeId] : [])) } }, select: { id: true, fullName: true, user: { select: { firstName: true, lastName: true } } } });
    const oname = new Map(openers.map((o) => [o.id, o.fullName ?? `${o.user?.firstName ?? ''} ${o.user?.lastName ?? ''}`.trim()]));
    return { data: rows.map((r) => ({ id: r.id, date: r.date, canal: code.get(r.canalId) ?? '', block: r.blockId ? bcode.get(r.blockId) ?? null : null, openedAt: r.openedAt, closedAt: r.closedAt, gateOpener: r.gateOpenerPayeeId ? oname.get(r.gateOpenerPayeeId) ?? null : null, loggedBy: uname.get(r.loggedById) ?? null, note: r.note, issue: r.issueType ? { type: r.issueType, note: r.issueNote, status: r.issueStatus, resolution: r.resolution, resolvedAt: r.resolvedAt } : null })) };
  }

  async resolveIssue(actor: RequestUser, id: string, dto: ResolveIssueDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const log = await this.prisma.waterLog.findFirst({ where: { id, mamcosId } });
    if (!log || !log.issueType) throw new NotFoundException('Water issue not found');
    const scope = await this.scopeService.resolve(actor);
    await this.scopeService.assertCanal(scope, log.canalId);
    if (scope.restricted && log.blockId && !scope.blockIds.includes(log.blockId) && !scope.canalIds.includes(log.canalId)) throw new ForbiddenException('You can only resolve issues on the canal or block you lead');
    const claimed = await this.prisma.waterLog.updateMany({ where: { id, issueStatus: 'OPEN' }, data: { issueStatus: 'RESOLVED', resolvedById: actor.id, resolvedAt: new Date(), resolution: dto.resolution.trim() } });
    if (!claimed.count) throw new ConflictException('This issue is already resolved');
    return { id, issueStatus: 'RESOLVED' };
  }

  /** The scheme's water today: which canals are scheduled, which have been logged, and the issues still open. */
  async overview(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    const canals = await this.prisma.irrigationCanal.findMany({ where: { scheme: { mamcosId }, archivedAt: null, ...this.scopeService.canalWhere(scope) }, orderBy: { canalNumber: 'asc' }, select: { id: true, code: true, name: true, status: true } });
    const ids = canals.map((c) => c.id);
    const t = today();
    const period = t.toISOString().slice(0, 7);
    const [schedules, logsToday, open] = await Promise.all([
      this.prisma.waterSchedule.findMany({ where: { mamcosId, canalId: { in: ids }, isActive: true, startsOn: { lte: t }, OR: [{ endsOn: null }, { endsOn: { gte: t } }] } }),
      this.prisma.waterLog.findMany({ where: { mamcosId, canalId: { in: ids }, date: t }, select: { canalId: true } }),
      this.prisma.waterLog.groupBy({ by: ['canalId'], where: { mamcosId, canalId: { in: ids }, issueStatus: 'OPEN', ...this.visible(scope) }, _count: true }),
    ]);
    const todayStr = t.toISOString().slice(0, 10);
    const dueToday = new Set(schedules.filter((s) => scheduledDays(s, period).has(todayStr)).map((s) => s.canalId));
    const logged = new Set(logsToday.map((l) => l.canalId));
    const issues = new Map(open.map((o) => [o.canalId, o._count]));
    return {
      date: todayStr,
      canals: canals.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status, scheduledToday: dueToday.has(c.id), loggedToday: logged.has(c.id), openIssues: issues.get(c.id) ?? 0 })),
      totals: { scheduledToday: dueToday.size, loggedToday: [...dueToday].filter((c) => logged.has(c)).length, openIssues: [...issues.values()].reduce((n, v) => n + v, 0) },
    };
  }
}
