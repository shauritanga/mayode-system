import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createRoleTemplates } from '../roles/role-templates';
import { today } from './irrigation-common';
import { BLOCK_LEADER_ROLE, CANAL_LEADER_ROLE, IRRIGATION_ROLE_TEMPLATES, LEADER_ROLE_NAMES } from './irrigation-roles';

/**
 * Canal and block leaders are AMCOS staff while they hold office. A member's own login (same phone and password) is
 * given the "Canal Leader" / "Block Leader" staff role when appointed, so it can open the AMCOS portal, and goes back to
 * an ordinary farmer login when the last appointment ends or lapses. Only logins this flow upgraded are ever reverted:
 * a member who is some other kind of staff keeps their account unchanged.
 */
@Injectable()
export class LeaderAccessService {
  private readonly logger = new Logger(LeaderAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Brings one member's login in line with their current appointments. Safe to call repeatedly. */
  async sync(tx: Prisma.TransactionClient, farmerId: string): Promise<'upgraded' | 'reverted' | 'unchanged'> {
    const farmer = await tx.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true, mamcosId: true, user: { select: { id: true, role: true, roleId: true, mamcosId: true } } },
    });
    if (!farmer?.user || !farmer.mamcosId) return 'unchanged';
    const user = farmer.user;

    const active = await tx.irrigationLeadership.findMany({
      where: { farmerId, status: 'ACTIVE', OR: [{ termEnd: null }, { termEnd: { gte: today() } }] },
      select: { position: true },
    });
    const wantedName = active.some((a) => a.position === 'CANAL_LEADER') ? CANAL_LEADER_ROLE : active.length ? BLOCK_LEADER_ROLE : null;

    const leaderRoles = await tx.role.findMany({
      where: { mamcosId: farmer.mamcosId, name: { in: LEADER_ROLE_NAMES } },
      select: { id: true, name: true },
    });
    const isLeaderRole = (id?: string | null) => !!id && leaderRoles.some((r) => r.id === id);

    if (wantedName) {
      const alreadyStaff = user.role !== UserRole.FARMER && !isLeaderRole(user.roleId);
      if (alreadyStaff) return 'unchanged';
      let role = leaderRoles.find((r) => r.name === wantedName);
      if (!role) {
        await createRoleTemplates(tx, farmer.mamcosId, [wantedName], IRRIGATION_ROLE_TEMPLATES);
        role = await tx.role.findFirst({ where: { mamcosId: farmer.mamcosId, name: wantedName }, select: { id: true, name: true } }) ?? undefined;
      }
      if (!role) return 'unchanged';
      if (user.role === UserRole.CUSTOM && user.roleId === role.id) return 'unchanged';
      await tx.user.update({ where: { id: user.id }, data: { role: UserRole.CUSTOM, roleId: role.id, mamcosId: farmer.mamcosId } });
      return 'upgraded';
    }

    if (user.role === UserRole.CUSTOM && isLeaderRole(user.roleId)) {
      await tx.user.update({ where: { id: user.id }, data: { role: UserRole.FARMER, roleId: null, mamcosId: null } });
      return 'reverted';
    }
    return 'unchanged';
  }

  /** Terms that simply run out are never "ended" by anyone, so the access they granted is withdrawn here, daily. */
  @Cron(process.env.LEADER_ACCESS_CRON || CronExpression.EVERY_DAY_AT_1AM)
  async revertLapsed(): Promise<number> {
    const holders = await this.prisma.user.findMany({
      where: { role: UserRole.CUSTOM, customRole: { name: { in: LEADER_ROLE_NAMES } }, farmer: { isNot: null } },
      select: { farmer: { select: { id: true } } },
    });
    let changed = 0;
    for (const holder of holders) {
      if (!holder.farmer) continue;
      const result = await this.prisma.$transaction((tx) => this.sync(tx, holder.farmer!.id));
      if (result !== 'unchanged') changed += 1;
    }
    if (changed) this.logger.log(`Adjusted ${changed} leader login(s)`);
    return changed;
  }
}
