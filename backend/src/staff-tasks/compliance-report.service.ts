import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { tenantOf, today } from './common';

export type Status = 'OK' | 'ATTENTION' | 'MISSING';
export interface Item { key: string; area: string; label: string; status: Status; detail: string }

/**
 * The Manager's compliance checklist: what the cooperative's own records show against the governance duties it carries (general meeting,
 * board meetings, officers in post, resolutions on record, members' consent, unresolved matters). A reading of the data held here: it
 * points at what to look into, it is not legal advice.
 */
@Injectable()
export class ComplianceReportService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  async report(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const now = today();
    const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
    const halfAgo = new Date(now.getTime() - 183 * 86_400_000);
    const [agm, boardMeetings, posts, lapsed, resolutions, farmers, consenting, openDisputes, underAdmin, unverified, overdueMaint, unreceived, openIncidents, anyMeeting] = await Promise.all([
      this.prisma.amcosMeeting.count({ where: { mamcosId, kind: 'AGM', status: 'CLOSED', scheduledAt: { gte: yearAgo } } }),
      this.prisma.amcosMeeting.count({ where: { mamcosId, kind: 'BOARD', status: 'CLOSED', scheduledAt: { gte: halfAgo } } }),
      this.prisma.boardMember.findMany({ where: { mamcosId, status: 'ACTIVE', position: { not: 'MEMBER' } }, select: { position: true } }),
      this.prisma.boardMember.count({ where: { mamcosId, status: 'ACTIVE', termEnd: { lt: now } } }),
      this.prisma.meetingResolution.count({ where: { meeting: { mamcosId }, createdAt: { gte: yearAgo } } }),
      this.prisma.farmer.count({ where: { mamcosId } }),
      this.prisma.farmer.count({ where: { mamcosId, dataShareConsent: true } }),
      this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] as never }, farm: { mamcosId } } }).catch(() => 0),
      this.prisma.farmDefaultCase.count({ where: { mamcosId, status: { in: ['UNDER_AMCOS', 'MLAX_NOTICE', 'AT_MLAX'] } } }),
      this.prisma.payrollPayee.count({ where: { mamcosId, isActive: true, verifiedAt: null } }),
      this.prisma.maintenanceSchedule.count({ where: { mamcosId, isActive: true, nextDueOn: { lt: now } } }),
      this.prisma.cashDrawerClose.count({ where: { mamcosId, status: 'SUBMITTED', day: { lt: new Date(now.getTime() - 2 * 86_400_000) } } }),
      this.prisma.harvestIncident.count({ where: { mamcosId, status: 'OPEN' } }),
      this.prisma.amcosMeeting.count({ where: { mamcosId } }),
    ]);
    const held = new Set(posts.map((p) => p.position));
    const missing = (['CHAIRPERSON', 'SECRETARY', 'TREASURER'] as const).filter((p) => !held.has(p));
    const pct = farmers ? Math.round((consenting / farmers) * 100) : 100;
    const items: Item[] = [
      { key: 'agm', area: 'General Meeting', label: 'A general meeting held in the last 12 months', status: agm ? 'OK' : anyMeeting ? 'ATTENTION' : 'MISSING', detail: agm ? `${agm} held` : 'No general meeting has been recorded as held in the last year.' },
      { key: 'board_meetings', area: 'Board', label: 'Board meetings in the last 6 months', status: boardMeetings >= 2 ? 'OK' : boardMeetings === 1 ? 'ATTENTION' : 'MISSING', detail: `${boardMeetings} board meeting(s) held (at least 2 expected)` },
      { key: 'officers', area: 'Board', label: 'Chairperson, Secretary and Treasurer in post', status: missing.length ? 'MISSING' : 'OK', detail: missing.length ? `Not filled: ${missing.join(', ').toLowerCase()}` : 'All three posts are filled' },
      { key: 'terms', area: 'Board', label: 'Board terms still running', status: lapsed ? 'ATTENTION' : 'OK', detail: lapsed ? `${lapsed} board member(s) have a term that has ended` : 'No board term has lapsed' },
      { key: 'resolutions', area: 'Resolutions', label: 'Resolutions on record in the last 12 months', status: resolutions ? 'OK' : 'ATTENTION', detail: resolutions ? `${resolutions} resolution(s) logged` : 'No resolution has been logged: decisions of meetings should be on record' },
      { key: 'consent', area: 'Data protection', label: 'Members who agreed to data sharing', status: pct >= 90 ? 'OK' : pct >= 50 ? 'ATTENTION' : 'MISSING', detail: `${consenting} of ${farmers} members (${pct}%) have given their consent` },
      { key: 'disputes', area: 'Disputes', label: 'Open disputes', status: openDisputes ? 'ATTENTION' : 'OK', detail: openDisputes ? `${openDisputes} dispute(s) still open` : 'None open' },
      { key: 'gate_incidents', area: 'Harvest gate', label: 'Open harvest gate incidents', status: openIncidents ? 'ATTENTION' : 'OK', detail: openIncidents ? `${openIncidents} waiting for the canal chairman` : 'None open' },
      { key: 'default_farms', area: 'Defaults', label: 'Farms under AMCOS administration for overdue debt', status: underAdmin ? 'ATTENTION' : 'OK', detail: underAdmin ? `${underAdmin} case(s) in progress: they move on by themselves` : 'None' },
      { key: 'payroll_verification', area: 'Payroll', label: 'People on the payroll waiting to be verified', status: unverified ? 'ATTENTION' : 'OK', detail: unverified ? `${unverified} not yet verified: they cannot be paid` : 'Everyone is verified' },
      { key: 'cash_summaries', area: 'Finance', label: 'Cashier summaries waiting for the Accountant', status: unreceived ? 'ATTENTION' : 'OK', detail: unreceived ? `${unreceived} older than two days` : 'Up to date' },
      { key: 'maintenance', area: 'Infrastructure', label: 'Maintenance jobs that are overdue', status: overdueMaint ? 'ATTENTION' : 'OK', detail: overdueMaint ? `${overdueMaint} overdue` : 'None overdue' },
    ];
    return { generatedAt: new Date(), summary: { ok: items.filter((i) => i.status === 'OK').length, attention: items.filter((i) => i.status === 'ATTENTION').length, missing: items.filter((i) => i.status === 'MISSING').length }, items };
  }
}
