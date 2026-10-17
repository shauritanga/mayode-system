import { PermissionResource } from '../auth/role-access';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { InsuranceService } from './insurance.service';
import { InsuranceApplicationsService } from './insurance-applications.service';
import { InsuranceAccessService } from './insurance-access.service';
import { ApproveInsuranceApplicationDto, RecordPremiumDto, RejectInsuranceApplicationDto, SubmitInsuranceApplicationDto } from './dto/insurance-application.dto';
import { Query } from '@nestjs/common';
import { InsuranceProductType } from '@prisma/client';
import { FarmingHistoryService } from '../rice-protocols/farming-history.service';
import {
  AmendPolicyDto,
  ClaimDecisionDto,
  ClaimPaymentDto,
  CreateInsuranceClaimDto,
  CreateInsurancePolicyDto,
  InspectClaimDto,
  RenewPolicyDto,
  UpdatePolicyStatusDto,
  UpsertInsuranceProviderDto,
} from './dto/insurance.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

@ApiTags('insurance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('insurance')
@Controller('insurance')
export class InsuranceController {
  constructor(
    private readonly insurance: InsuranceService,
    private readonly applications: InsuranceApplicationsService,
    private readonly access: InsuranceAccessService,
    private readonly history: FarmingHistoryService,
  ) {}

  @Post('providers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('insurance', 'CREATE')
  createProvider(@Body() dto: UpsertInsuranceProviderDto) {
    return this.insurance.createProvider(dto);
  }

  @Get('providers')
  @Roles(...STAFF_ROLES)
  @RequirePermission('insurance', 'VIEW')
  findAllProviders() {
    return this.insurance.findAllProviders();
  }

  @Patch('providers/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('insurance', 'EDIT')
  updateProvider(
    @Param('id') id: string,
    @Body() dto: UpsertInsuranceProviderDto,
  ) {
    return this.insurance.updateProvider(id, dto);
  }

  @Post('policies')
  @Roles(...STAFF_ROLES)
  @RequirePermission('insurance', 'CREATE')
  @ApiOperation({
    summary: 'Register a new crop insurance policy for a farmer',
  })
  createPolicy(@Body() dto: CreateInsurancePolicyDto, @CurrentUser() user: RequestUser) {
    return this.insurance.createPolicy(dto, user);
  }

  @Get('policies')
  @Roles(...STAFF_ROLES)
  @RequirePermission('insurance', 'VIEW')
  @ApiOperation({
    summary: 'Get all insurance policies across the system (staff only)',
  })
  findAllPolicies(@CurrentUser() user: RequestUser) {
    return this.insurance.findAllPolicies(user);
  }

  @Get('policies/me')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'List insurance policies and claims for the logged-in farmer' })
  policiesForSelf(@CurrentUser() user: RequestUser) {
    return this.insurance.policiesForSelf(user);
  }

  @Get('policies/farmer/:farmerId')
  @Roles(...STAFF_ROLES, UserRole.FARMER)
  findPoliciesForFarmer(
    @Param('farmerId') farmerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.insurance.findPoliciesForFarmer(farmerId, user);
  }

  @Patch('policies/:id/status')
  @Roles(...STAFF_ROLES)
  updatePolicyStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyStatusDto,
  ) {
    return this.insurance.updatePolicyStatus(id, dto);
  }

  @Patch('policies/:id/amend')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      "Amend a policy's coverage/financial terms (sum insured, premium, area, dates)",
  })
  amendPolicy(@Param('id') id: string, @Body() dto: AmendPolicyDto) {
    return this.insurance.amendPolicy(id, dto);
  }

  @Post('policies/:id/renew')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      'Renew an expiring policy into a new PENDING policy chained via renewedFromPolicyId',
  })
  renewPolicy(@Param('id') id: string, @Body() dto: RenewPolicyDto) {
    return this.insurance.renewPolicy(id, dto);
  }

  @Post('claims')
  @Roles(...STAFF_ROLES, UserRole.FIELD_OFFICER, UserRole.FARMER)
  createClaim(
    @Body() dto: CreateInsuranceClaimDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.insurance.createClaim(dto, user);
  }

  @Get('claims/:id/farming-history')
  @Roles(...STAFF_ROLES, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Farming record behind a claim: required activities done on time, late or missed, plus extras',
  })
  claimFarmingHistory(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.history.forClaim(id, user);
  }

  @Get('claims')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Get all insurance claims across the system (staff only)',
  })
  findAllClaims(@CurrentUser() user: RequestUser) {
    return this.insurance.findAllClaims(user);
  }

  @Patch('claims/:id/inspect')
  @Roles(UserRole.FIELD_OFFICER, UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  inspectClaim(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: InspectClaimDto,
  ) {
    return this.insurance.inspectClaim(id, user, dto);
  }

  @Patch('claims/:id/decision')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  @ApiOperation({ summary: 'The insurer approves an amount or rejects the claim' })
  decideClaim(@Param('id') id: string, @Body() dto: ClaimDecisionDto, @CurrentUser() user: RequestUser) {
    return this.insurance.decideClaim(id, dto, user);
  }

  @Patch('claims/:id/payment')
  @Roles(UserRole.FINANCIAL_PROVIDER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Record a payment towards an approved claim' })
  payClaim(@Param('id') id: string, @Body() dto: ClaimPaymentDto, @CurrentUser() user: RequestUser) {
    return this.insurance.payClaim(id, dto, user);
  }

  @Post('policies/:id/premium')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('insurance', 'EDIT')
  @ApiOperation({ summary: 'Staff record premium collected from the farmer' })
  recordPremium(@Param('id') id: string, @Body() dto: RecordPremiumDto, @CurrentUser() user: RequestUser) {
    return this.insurance.recordPolicyPremium(id, dto, user);
  }

  // ── Products, risk, applications ──

  @Get('products')
  @Roles(...STAFF_ROLES, UserRole.FARMER, UserRole.FIELD_OFFICER)
  products() {
    return this.applications.guide();
  }

  @Get('insurers')
  @Roles(...STAFF_ROLES, UserRole.FARMER, UserRole.FIELD_OFFICER)
  insurers() {
    return this.applications.insurers();
  }

  @Get('risk')
  @Roles(...STAFF_ROLES, UserRole.FARMER, UserRole.FIELD_OFFICER)
  async risk(@CurrentUser() user: RequestUser, @Query('farmerId') farmerId?: string, @Query('farmId') farmId?: string) {
    return this.applications.risk(await this.applications.farmerIdFor(user, farmerId), farmId);
  }

  @Get('suggestion')
  @Roles(...STAFF_ROLES, UserRole.FARMER, UserRole.FIELD_OFFICER)
  async suggestion(
    @CurrentUser() user: RequestUser,
    @Query('product') product: InsuranceProductType,
    @Query('areaHa') areaHa: string,
    @Query('farmerId') farmerId?: string,
  ) {
    return this.applications.suggestion(await this.applications.farmerIdFor(user, farmerId), product, Number(areaHa) || 0);
  }

  @Get('applications')
  @Roles(...STAFF_ROLES, UserRole.FARMER, UserRole.FIELD_OFFICER, UserRole.FINANCIAL_PROVIDER)
  listApplications(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.applications.list(user, { status });
  }

  @Post('applications')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.FIELD_OFFICER, UserRole.FARMER)
  submitApplication(@Body() dto: SubmitInsuranceApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.submit(dto, user);
  }

  @Get('applications/:id')
  @Roles(...STAFF_ROLES, UserRole.FARMER, UserRole.FIELD_OFFICER, UserRole.FINANCIAL_PROVIDER)
  application(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.detail(id, user);
  }

  @Patch('applications/:id/withdraw')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.FIELD_OFFICER, UserRole.FARMER)
  withdrawApplication(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.withdraw(id, user);
  }

  @Patch('applications/:id/review')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  reviewApplication(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.applications.startReview(id, user);
  }

  @Patch('applications/:id/approve')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  approveApplication(@Param('id') id: string, @Body() dto: ApproveInsuranceApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.approve(id, dto, user);
  }

  @Patch('applications/:id/reject')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  rejectApplication(@Param('id') id: string, @Body() dto: RejectInsuranceApplicationDto, @CurrentUser() user: RequestUser) {
    return this.applications.reject(id, dto, user);
  }

  @Post('applications/:id/premium')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Staff record the premium paid; the policy then starts' })
  premiumForApplication(@Param('id') id: string, @Body() dto: RecordPremiumDto, @CurrentUser() user: RequestUser) {
    return this.applications.recordPremium(id, dto, user);
  }

  // ── Insurer's own view ──

  @Get('desk/me')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  @ApiOperation({ summary: 'The insurance company this login belongs to, or null' })
  async deskMe(@CurrentUser() user: RequestUser) {
    return (await this.access.providerFor(user.id)) ?? null;
  }

  @Get('desk/policies')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  deskPolicies(@CurrentUser() user: RequestUser) {
    return this.insurance.findAllPolicies(user);
  }

  @Get('desk/claims')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  deskClaims(@CurrentUser() user: RequestUser) {
    return this.insurance.findAllClaims(user);
  }

  @Get('desk/summary')
  @Roles(UserRole.FINANCIAL_PROVIDER)
  deskSummary(@CurrentUser() user: RequestUser) {
    return this.insurance.coverageSummary(user);
  }

  @Get('claims/:id/weather-context')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      "Weather alerts issued near this claim's incident date/location — supporting evidence, not a decision rule",
  })
  getWeatherContextForClaim(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.insurance.getWeatherContextForClaim(id, user);
  }

  @Get('coverage-summary')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Aggregate insurance coverage stats for the admin dashboard',
  })
  coverageSummary(@CurrentUser() user: RequestUser) {
    return this.insurance.coverageSummary(user);
  }
}
