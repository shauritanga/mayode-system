import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { InsuranceService } from './insurance.service';
import {
  AmendPolicyDto,
  CreateInsuranceClaimDto,
  CreateInsurancePolicyDto,
  InspectClaimDto,
  RenewPolicyDto,
  UpdateClaimPaymentDto,
  UpdatePolicyStatusDto,
  UpsertInsuranceProviderDto,
} from './dto/insurance.dto';

const STAFF_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.AUDITOR];

@ApiTags('insurance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  @Post('providers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createProvider(@Body() dto: UpsertInsuranceProviderDto) {
    return this.insurance.createProvider(dto);
  }

  @Get('providers')
  @Roles(...STAFF_ROLES)
  findAllProviders() {
    return this.insurance.findAllProviders();
  }

  @Patch('providers/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateProvider(@Param('id') id: string, @Body() dto: UpsertInsuranceProviderDto) {
    return this.insurance.updateProvider(id, dto);
  }

  @Post('policies')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Register a new crop insurance policy for a farmer' })
  createPolicy(@Body() dto: CreateInsurancePolicyDto) {
    return this.insurance.createPolicy(dto);
  }

  @Get('policies')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get all insurance policies across the system (staff only)' })
  findAllPolicies() {
    return this.insurance.findAllPolicies();
  }

  @Get('policies/farmer/:farmerId')
  findPoliciesForFarmer(@Param('farmerId') farmerId: string) {
    return this.insurance.findPoliciesForFarmer(farmerId);
  }

  @Patch('policies/:id/status')
  @Roles(...STAFF_ROLES)
  updatePolicyStatus(@Param('id') id: string, @Body() dto: UpdatePolicyStatusDto) {
    return this.insurance.updatePolicyStatus(id, dto);
  }

  @Patch('policies/:id/amend')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Amend a policy\'s coverage/financial terms (sum insured, premium, area, dates)' })
  amendPolicy(@Param('id') id: string, @Body() dto: AmendPolicyDto) {
    return this.insurance.amendPolicy(id, dto);
  }

  @Post('policies/:id/renew')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Renew an expiring policy into a new PENDING policy chained via renewedFromPolicyId' })
  renewPolicy(@Param('id') id: string, @Body() dto: RenewPolicyDto) {
    return this.insurance.renewPolicy(id, dto);
  }

  @Post('claims')
  @Roles(...STAFF_ROLES, UserRole.FIELD_OFFICER, UserRole.FARMER)
  createClaim(@Body() dto: CreateInsuranceClaimDto) {
    return this.insurance.createClaim(dto);
  }

  @Get('claims')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get all insurance claims across the system (staff only)' })
  findAllClaims() {
    return this.insurance.findAllClaims();
  }

  @Patch('claims/:id/inspect')
  @Roles(UserRole.FIELD_OFFICER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  inspectClaim(@Param('id') id: string, @CurrentUser() user: RequestUser, @Body() dto: InspectClaimDto) {
    return this.insurance.inspectClaim(id, user.id, dto);
  }

  @Patch('claims/:id/payment')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateClaimPayment(@Param('id') id: string, @Body() dto: UpdateClaimPaymentDto) {
    return this.insurance.updateClaimPayment(id, dto);
  }

  @Get('claims/:id/weather-context')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Weather alerts issued near this claim\'s incident date/location — supporting evidence, not a decision rule' })
  getWeatherContextForClaim(@Param('id') id: string) {
    return this.insurance.getWeatherContextForClaim(id);
  }

  @Get('coverage-summary')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Aggregate insurance coverage stats for the admin dashboard' })
  coverageSummary() {
    return this.insurance.coverageSummary();
  }
}
