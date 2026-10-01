import { CreateProjectDto } from './dto/create-project.dto';
import { PermissionResource } from '../auth/role-access';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GovernanceService } from './governance.service';
import type { RequestUser } from '../common/ownership.service';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { CreateVoteDto } from './dto/create-vote.dto';
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('governance')
@Controller('governance')
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}
  @Get('projects') projects(@CurrentUser() user: RequestUser) {
    return this.service.projects(user);
  }
  @Get('projects/:id') project(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.project(id, user);
  }
  @Post('projects') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @RequirePermission('governance', 'CREATE') createProject(
    @Body() body: CreateProjectDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createProject(body, user);
  }
  @Patch('projects/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermission('governance', 'EDIT')
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: RequestUser) {
    return this.service.updateProject(id, dto, user);
  }
  @Delete('projects/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermission('governance', 'DELETE')
  removeProject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.removeProject(id, user);
  }
  @Get('meetings') meetings(@CurrentUser() user: RequestUser) {
    return this.service.meetings(user);
  }
  @Get('report')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  report(@CurrentUser() user: RequestUser) {
    return this.service.report(user);
  }
  @Post('meetings') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) meeting(
    @Body() body: CreateMeetingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createMeeting(body, user);
  }
  @Get('votes') votes(@CurrentUser() user: RequestUser) {
    return this.service.listVotes(user);
  }
  @Post('votes') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) vote(
    @Body() body: CreateVoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createVote(body, user);
  }
  @Post('votes/:id/open') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) open(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.openVote(id, user);
  }
  @Post('votes/:id/close') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) close(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.closeVote(id, user);
  }
  @Post('votes/:id/respond/:optionId') @Roles(UserRole.FARMER) respond(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.respond(id, optionId, user);
  }
  @Get('votes/:id/results') results(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.results(id, user);
  }
}
