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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FarmersService } from './farmers.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { QueryFarmersDto } from './dto/query-farmers.dto';
import {
  VerifyFarmerDto,
  RejectFarmerDto,
  SuspendFarmerDto,
  UpsertHouseholdDto,
  LinkDocumentDto,
  SubmitIdentityDto,
} from './dto/farmer-actions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../common/ownership.service';

@ApiTags('farmers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmersService: FarmersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Register a new farmer (provisions login + profile)' })
  create(@Body() dto: CreateFarmerDto) {
    return this.farmersService.create(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.MAMCOS_SECRETARY, UserRole.AUDITOR)
  @ApiOperation({ summary: 'List farmers (search, filter by location/cooperative/status, paginated)' })
  findAll(@Query() query: QueryFarmersDto) {
    return this.farmersService.findAll(query);
  }

  @Get('overview')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.MAMCOS_SECRETARY, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Farmer dashboard aggregates (counts by status and region)' })
  overview() {
    return this.farmersService.getOverview();
  }

  @Get('control-number/:controlNumber')
  @ApiOperation({ summary: 'Get farmer by unique Control Number (e.g., MYD-00001)' })
  findByControlNumber(@Param('controlNumber') controlNumber: string) {
    return this.farmersService.findByControlNumber(controlNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get farmer profile by ID (household, documents, verifications, farms)' })
  findOne(@Param('id') id: string) {
    return this.farmersService.findOne(id);
  }

  @Get(':id/credit-score')
  @ApiOperation({ summary: 'Get stored credit score and blacklist status' })
  getCreditScore(@Param('id') id: string) {
    return this.farmersService.getCreditScore(id);
  }

  @Get(':id/credit-readiness')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FINANCIAL_PROVIDER, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Compute & persist credit-readiness score with factor breakdown' })
  getCreditReadiness(@Param('id') id: string) {
    return this.farmersService.getCreditReadiness(id);
  }

  @Get(':id/production-summary')
  @ApiOperation({ summary: 'Farmer production history summary (yields per cycle)' })
  getProductionSummary(@Param('id') id: string) {
    return this.farmersService.getProductionSummary(id);
  }

  @Get(':id/financial-summary')
  @ApiOperation({
    summary:
      'Farmer financial summary (costs, revenues, net profit). Premium: free users receive a locked preview.',
  })
  getFinancialSummary(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.farmersService.getFinancialSummary(id, user);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List a farmer’s uploaded documents' })
  listDocuments(@Param('id') id: string) {
    return this.farmersService.listDocuments(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update farmer profile (own profile for farmers, any for staff)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFarmerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmersService.update(id, dto, user);
  }

  @Post(':id/verify')
  @Roles(UserRole.FIELD_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verify a farmer (Field Officer / Admin)' })
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyFarmerDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.farmersService.verifyFarmer(user.id, id, dto);
  }

  @Post(':id/reject')
  @Roles(UserRole.FIELD_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject a farmer application with a reason' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectFarmerDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.farmersService.rejectFarmer(user.id, id, dto);
  }

  @Post(':id/suspend')
  @Roles(UserRole.FIELD_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @ApiOperation({ summary: 'Link an uploaded file as a typed document on the farmer' })
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Delete a document by ID' })
  removeDocument(@Param('documentId') documentId: string) {
    return this.farmersService.removeDocument(documentId);
  }
}
