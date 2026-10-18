import { Controller, Injectable, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { assertWithinCeiling } from '../auth/delegation';
import { createRoleTemplates } from '../roles/role-templates';
import { OPS_ROLE_TEMPLATES } from './ops-roles';

@Injectable()
export class OpsSetupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates Mayode's operational roles for the caller's organisation. Roles that already exist are left as they are. */
  async installRoles(actor: RequestUser) {
    const scopeId = actor.role === UserRole.SUPER_ADMIN ? null : (actor.mamcosId ?? null);
    const allowed = OPS_ROLE_TEMPLATES.filter((t) => {
      try {
        assertWithinCeiling(actor as never, Object.entries(t.grants).flatMap(([resource, actions]) => actions.map((action) => ({ resource, action }))));
        return true;
      } catch {
        return false;
      }
    });
    const created = await this.prisma.$transaction((tx) => createRoleTemplates(tx, scopeId, allowed.map((t) => t.name), OPS_ROLE_TEMPLATES));
    return {
      created,
      alreadyExisted: allowed.map((t) => t.name).filter((n) => !created.includes(n)),
      skippedBecauseYouDoNotHoldThesePermissions: OPS_ROLE_TEMPLATES.filter((t) => !allowed.includes(t)).map((t) => t.name),
    };
  }
}

@ApiTags('ops-setup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('ops/setup')
export class OpsSetupController {
  constructor(private readonly setup: OpsSetupService) {}

  @Post('roles')
  @RequirePermission('roles', 'CREATE')
  @ApiOperation({ summary: 'Create the Sales, Accounts, Warehouse, Farm Manager, Agronomist, Field Worker and Management roles' })
  roles(@CurrentUser() user: RequestUser) {
    return this.setup.installRoles(user);
  }
}
