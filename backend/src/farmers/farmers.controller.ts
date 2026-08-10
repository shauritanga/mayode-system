import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FarmersService } from './farmers.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { QueryFarmersDto } from './dto/query-farmers.dto';
import {
  AssignOfficerDto,
  VerifyFarmerDto,
  RejectFarmerDto,
  SuspendFarmerDto,
  UpsertHouseholdDto,
  LinkDocumentDto,
  SubmitIdentityDto,
} from './dto/farmer-actions.dto';
import {
  CaptureConsentDto,
  CreateQuestionnaireDto,
} from './dto/trust-layer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../common/ownership.service';
import { ExportService } from '../common/export.service';

@ApiTags('farmers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farmers')
export class FarmersController {
  constructor(
    private readonly farmersService: FarmersService,
    private readonly exporter: ExportService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({
    summary: 'Register a new farmer (provisions login + profile)',
  })
  create(@Body() dto: CreateFarmerDto) {
    return this.farmersService.create(dto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary:
      'List farmers (search, filter by location/cooperative/status, paginated) — Admin read-only for reporting/Finance farmer lookup',
  })
  async findAll(
    @Query() query: QueryFarmersDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.farmersService.findAll(query);
    if (!query.format || query.format === 'json') return result;
    const rows = result.data.map((farmer: any) => ({
      controlNumber: farmer.controlNumber,
      firstName: farmer.firstName,
      lastName: farmer.lastName,
      phone: farmer.user?.phone ?? '',
      village: farmer.village ?? '',
      district: farmer.district ?? '',
      region: farmer.region ?? '',
      verificationStatus: farmer.verificationStatus,
    }));
    if (query.format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="farmers.csv"',
      );
      return response.send(this.exporter.csv(rows));
    }
    if (query.format === 'pdf') {
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="farmers.pdf"',
      );
      return response.send(await this.exporter.pdf(rows, 'farmers'));
    }
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="farmers.xlsx"',
    );
    return response.send(this.exporter.xlsx(rows, 'farmers'));
  }

  @Get('overview')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary: 'Farmer dashboard aggregates (counts by status and region)',
  })
  overview() {
    return this.farmersService.getOverview();
  }

  @Get('all')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary:
      'Unpaginated farmer list for admin dashboard reporting/aggregation (minimal fields — not for UI tables, use GET /farmers for that)',
  })
  findAllUnpaginated() {
    return this.farmersService.findAllUnpaginated();
  }

  @Get('control-number/:controlNumber')
  @ApiOperation({
    summary: 'Get farmer by unique Control Number (e.g., MYD-00001)',
  })
  findByControlNumber(@Param('controlNumber') controlNumber: string) {
    return this.farmersService.findByControlNumber(controlNumber);
  }

  @Get('me')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'Get the farmer profile linked to the current user' })
  findMe(@CurrentUser() user: RequestUser) {
    return this.farmersService.findMe(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get farmer profile by ID (household, documents, verifications, farms)',
  })
  findOne(@Param('id') id: string) {
    return this.farmersService.findOne(id);
  }

  @Get(':id/credit-score')
  @ApiOperation({ summary: 'Get stored credit score and blacklist status' })
  getCreditScore(@Param('id') id: string) {
    return this.farmersService.getCreditScore(id);
  }

  @Get(':id/credit-readiness')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.FINANCIAL_PROVIDER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary: 'Compute & persist credit-readiness score with factor breakdown',
  })
  getCreditReadiness(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.getCreditReadiness(id, user);
  }

  @Get(':id/production-summary')
  @ApiOperation({
    summary: 'Farmer production history summary (yields per cycle)',
  })
  getProductionSummary(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.getProductionSummary(id, user);
  }

  @Get(':id/financial-summary')
  @ApiOperation({
    summary:
      'Farmer financial summary (costs, revenues, net profit). Premium: free users receive a locked preview.',
  })
  getFinancialSummary(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.getFinancialSummary(id, user);
  }

  @Get(':id/financial-profile')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FINANCIAL_PROVIDER,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary:
      'Formal farmer financial profile for staff/auditors and consented financial-provider sharing',
  })
  getFinancialProfile(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.getFormalFinancialProfile(id, user);
  }

  @Post(':id/consents')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary:
      'Capture a formal farmer consent/revocation record, including financial-provider sharing consent',
  })
  captureConsent(
    @Param('id') id: string,
    @Body() dto: CaptureConsentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.captureConsent(id, dto, user);
  }

  @Get(':id/consents')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: 'List formal consent records for a farmer' })
  listConsents(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.listConsents(id, user);
  }

  @Post(':id/questionnaires')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Capture official MAYOData farmer/farm questionnaire sections as an auditable record',
  })
  createQuestionnaire(
    @Param('id') id: string,
    @Body() dto: CreateQuestionnaireDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.createQuestionnaire(id, dto, user);
  }

  @Get(':id/questionnaires')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: 'List official questionnaire records for a farmer' })
  listQuestionnaires(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.listQuestionnaires(id, user);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List a farmer’s uploaded documents' })
  listDocuments(@Param('id') id: string) {
    return this.farmersService.listDocuments(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update farmer profile (own profile for farmers, any for staff)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFarmerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.update(id, dto, user);
  }

  @Patch(':id/assign-officer')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Assign a field officer as responsible for a farmer\'s follow-up' })
  assignOfficer(@Param('id') id: string, @Body() dto: AssignOfficerDto) {
    return this.farmersService.assignOfficer(id, dto);
  }

  @Post(':id/verify')
  @Roles(UserRole.FIELD_OFFICER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verify a farmer (Field Officer / Admin)' })
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyFarmerDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.farmersService.verifyFarmer(user.id, id, dto);
  }

  @Post(':id/reject')
  @Roles(UserRole.FIELD_OFFICER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject a farmer application with a reason' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectFarmerDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.farmersService.rejectFarmer(user.id, id, dto);
  }

  @Post(':id/suspend')
  @Roles(UserRole.FIELD_OFFICER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Suspend a farmer with a reason' })
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendFarmerDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.farmersService.suspendFarmer(user.id, id, dto);
  }

  @Put(':id/household')
  @ApiOperation({ summary: 'Create or update a farmer’s household record' })
  upsertHousehold(
    @Param('id') id: string,
    @Body() dto: UpsertHouseholdDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.upsertHousehold(id, dto, user);
  }

  @Post(':id/documents')
  @ApiOperation({
    summary: 'Link an uploaded file as a typed document on the farmer',
  })
  addDocument(
    @Param('id') id: string,
    @Body() dto: LinkDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.addDocument(id, dto, user);
  }

  @Post(':id/identity')
  @ApiOperation({
    summary:
      'Submit final-stage identity verification (ID document, number, photo/face capture) for officer review',
  })
  submitIdentity(
    @Param('id') id: string,
    @Body() dto: SubmitIdentityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.submitIdentity(id, dto, user);
  }

  @Delete('documents/:documentId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Delete a document by ID' })
  removeDocument(@Param('documentId') documentId: string) {
    return this.farmersService.removeDocument(documentId);
  }
}
