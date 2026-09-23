import { PermissionResource } from '../auth/role-access';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@PermissionResource('workspace')
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('context')
  @ApiOperation({ summary: 'Role-scoped dashboard context and work queue' })
  context(@CurrentUser() user: RequestUser) {
    return this.workspace.context(user);
  }
}
