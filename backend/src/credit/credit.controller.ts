import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { LoanApplicationsService } from './loan-applications.service';
import { ApproveApplicationDto, DisburseApplicationDto, RejectApplicationDto, SubmitApplicationDto } from './dto/credit.dto';

const STAFF = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY];
const READERS = [...STAFF, UserRole.AUDITOR, UserRole.FARMER, UserRole.FINANCIAL_PROVIDER];

@ApiTags('credit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('credit')
export class CreditController {
  constructor(private readonly applications: LoanApplicationsService) {}

  @Get('lenders')
  @Roles(...STAFF, UserRole.FIELD_OFFICER, UserRole.FARMER)
  lenders() {
    return this.applications.lenders();
  }

  @Get('summary')
  @Roles(...READERS)
  summary(@CurrentUser() user: RequestUser) {
    return this.applications.summary(user);
  }

  @Get('applications')
  @Roles(...READERS, UserRole.FIELD_OFFICER)
  list(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.applications.list(user, { status });
  }

  @Post('applications')
  @Roles(...STAFF, UserRole.FIELD_OFFICER, UserRole.FARMER)
  submit(@Body() dto: SubmitApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.submit(dto, user);
  }

  @Get('applications/:id')
  @Roles(...READERS, UserRole.FIELD_OFFICER)
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.detail(id, user);
  }

  @Get('applications/:id/profile')
  @Roles(...READERS, UserRole.FIELD_OFFICER)
  profile(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.profileFor(id, user);
  }

  @Patch('applications/:id/withdraw')
  @Roles(...STAFF, UserRole.FIELD_OFFICER, UserRole.FARMER)
  withdraw(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.withdraw(id, user);
  }

  @Patch('applications/:id/review')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  review(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.startReview(id, user);
  }

  @Patch('applications/:id/approve')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  approve(@Param('id') id: string, @Body() dto: ApproveApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.approve(id, dto, user);
  }

  @Patch('applications/:id/reject')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  reject(@Param('id') id: string, @Body() dto: RejectApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.reject(id, dto, user);
  }

  @Patch('applications/:id/disburse')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  disburse(@Param('id') id: string, @Body() dto: DisburseApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.disburse(id, dto, user);
  }

  @Get('loans')
  @Roles(...READERS)
  loans(@CurrentUser() user: RequestUser) {
    return this.applications.loans(user);
  }

  @Get('loans/:id/schedule')
  @Roles(...READERS)
  schedule(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.schedule(id, user);
  }

  @Get('farmers/:farmerId/profile')
  @Roles(...READERS, UserRole.FIELD_OFFICER)
  farmerProfile(@Param('farmerId') farmerId: string, @CurrentUser() user: RequestUser) {
    return this.applications.farmerProfile(farmerId, user);
  }
}
