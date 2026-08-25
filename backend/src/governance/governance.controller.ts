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
@Controller('governance')
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}
  @Get('projects') projects() {
    return this.service.projects();
  }
  @Get('projects/:id') project(@Param('id') id: string) {
    return this.service.project(id);
  }
  @Post('projects') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @RequirePermission('governance', 'CREATE') createProject(
    @Body() body: any,
  ) {
    return this.service.createProject(body);
  }
  @Patch('projects/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermission('governance', 'EDIT')
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.updateProject(id, dto);
  }
  @Delete('projects/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermission('governance', 'DELETE')
  removeProject(@Param('id') id: string) {
    return this.service.removeProject(id);
  }
  @Get('meetings') meetings() {
    return this.service.meetings();
  }
  @Get('report')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  report() {
    return this.service.report();
  }
  @Post('meetings') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) meeting(
    @Body() body: CreateMeetingDto,
  ) {
    return this.service.createMeeting(body);
  }
  @Get('votes') votes() {
    return this.service.listVotes();
  }
  @Post('votes') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) vote(
    @Body() body: CreateVoteDto,
  ) {
    return this.service.createVote(body);
  }
  @Post('votes/:id/open') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) open(
    @Param('id') id: string,
  ) {
    return this.service.openVote(id);
  }
  @Post('votes/:id/close') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) close(
    @Param('id') id: string,
  ) {
    return this.service.closeVote(id);
  }
  @Post('votes/:id/respond/:optionId') @Roles(UserRole.FARMER) respond(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.respond(id, optionId, user);
  }
  @Get('votes/:id/results') results(@Param('id') id: string) {
    return this.service.results(id);
  }
}
