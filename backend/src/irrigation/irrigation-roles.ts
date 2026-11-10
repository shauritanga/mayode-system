import { Injectable } from '@nestjs/common';
import { PermissionAction, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { assertWithinCeiling } from '../auth/delegation';
import { createRoleTemplates, type RoleTemplate } from '../roles/role-templates';

const V: PermissionAction[] = ['VIEW'];
const VCE: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT'];
const ALL: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];

/**
 * Starting roles for the irrigation module. Whether a user sees the whole scheme or only their canal / block is
 * decided by IrrigationScopeService: EDIT on `irrigation` makes someone a scheme manager; a role without it, held by
 * a member who currently leads a canal or block, is confined to that canal / block.
 */
export const CANAL_LEADER_ROLE = 'Canal Leader';
export const BLOCK_LEADER_ROLE = 'Block Leader';
export const LEADER_ROLE_NAMES = [CANAL_LEADER_ROLE, BLOCK_LEADER_ROLE];
export const COMBINE_OPERATOR_ROLE = 'Combine Operator';

export const IRRIGATION_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: 'Irrigation Scheme Manager',
    description: 'Runs the irrigation scheme across the whole AMCOS: structure, allocations, transfers and leader appointments.',
    grants: {
      irrigation: ALL, irrigation_allocations: VCE, irrigation_leadership: VCE, farmers: V, mamcos: V,
    },
  },
  {
    name: CANAL_LEADER_ROLE,
    description: 'Sees only the canal they currently lead with its blocks and hectares. Allocates hectares there and appoints its block leaders.',
    grants: { irrigation: V, irrigation_allocations: VCE, irrigation_leadership: VCE, irrigation_verification: ['VIEW', 'EDIT'], harvest_clearance: V, harvest_passes: VCE, payroll_attendance: VCE, water: VCE, water_schedules: V, maintenance_schedule: V, combine_harvesters: V, harvest_collections: VCE },
  },
  {
    name: BLOCK_LEADER_ROLE,
    description: 'Sees only the block they currently lead with its hectares and farmers. Read-only unless an administrator adds rights.',
    grants: { irrigation: V, irrigation_allocations: V, irrigation_leadership: V, irrigation_verification: ['VIEW', 'EDIT'], harvest_clearance: V, harvest_passes: VCE, payroll_attendance: VCE, water: VCE, water_schedules: V, maintenance_schedule: V, combine_harvesters: V, harvest_collections: VCE },
  },
  {
    name: COMBINE_OPERATOR_ROLE,
    description: 'Combine harvester operator: sees the harvest fee schedule and each block\u2019s plots, logs arrival in a block and checks the pass code of a plot before harvesting it. Nothing else.',
    grants: { harvest_clearance: V, harvest_fees: V, harvest_passes: VCE },
  },
];

@Injectable()
export class IrrigationSetupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the irrigation roles for the caller's organisation; roles that already exist are left alone. */
  async installRoles(actor: RequestUser) {
    const scopeId = actor.role === UserRole.SUPER_ADMIN ? null : (actor.mamcosId ?? null);
    const allowed = IRRIGATION_ROLE_TEMPLATES.filter((t) => {
      try {
        assertWithinCeiling(actor as never, Object.entries(t.grants).flatMap(([resource, actions]) => actions.map((action) => ({ resource, action }))));
        return true;
      } catch {
        return false;
      }
    });
    const created = await this.prisma.$transaction((tx) =>
      createRoleTemplates(tx, scopeId, allowed.map((t) => t.name), IRRIGATION_ROLE_TEMPLATES));
    return {
      created,
      alreadyExisted: allowed.map((t) => t.name).filter((n) => !created.includes(n)),
      skippedBecauseYouDoNotHoldThesePermissions: IRRIGATION_ROLE_TEMPLATES.filter((t) => !allowed.includes(t)).map((t) => t.name),
    };
  }
}
