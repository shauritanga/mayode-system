import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import {
  CreateFarmDto,
  UpdateFarmDto,
  UpdateBoundaryDto,
} from './dto/farms.dto';
import { QueryFarmsDto } from './dto/query-farms.dto';
import { LinkDocumentDto } from '../farmers/dto/farmer-actions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../common/ownership.service';

@ApiTags('farms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @RequirePermission('farms', 'CREATE')
  @ApiOperation({
    summary:
      'Register a new farm with auto-generated Farm Code (e.g., FP-JD-01)',
  })
  create(@Body() dto: CreateFarmDto, @CurrentUser() user: RequestUser) {
    return this.farmsService.create(dto, user);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('farms', 'VIEW')
  @ApiOperation({
    summary: 'List farms (filter by farmer/cooperative/grade/verified/village)',
  })
  findAll(@Query() query: QueryFarmsDto, @CurrentUser() user: RequestUser) {
    return this.farmsService.findAll(query, user);
  }

  @Get('overview')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary: 'Farm/plot dashboard aggregates (mapped, verified, by grade)',
  })
  overview() {
    return this.farmsService.getOverview();
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('farms', 'VIEW')
  @ApiOperation({
    summary:
      'Get farm details by ID (plots, documents, verifications, crop cycles)',
  })
  findOne(@Param('id') id: string) {
    return this.farmsService.findOne(id);
  }

  @Get(':id/productivity')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary:
      'Farm productivity report (yield/acre, cost/acre, cost/kg). Premium: free users receive a locked preview.',
  })
  productivity(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.farmsService.getProductivity(id, user);
  }

  @Get(':id/documents')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: 'List a farm’s documents' })
  listDocuments(@Param('id') id: string) {
    return this.farmsService.listDocuments(id);
  }

  @Get('farmer/:farmerId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: 'Get all farms owned by a specific farmer' })
  findByFarmerId(@Param('farmerId') farmerId: string) {
    return this.farmsService.findByFarmerId(farmerId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @RequirePermission('farms', 'EDIT')
  @ApiOperation({ summary: 'Update farm profile details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmsService.update(id, dto, user);
  }

  @Patch(':id/boundary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary: 'Update farm GPS boundary (GeoJSON Polygon) and center Lat/Lng',
  })
  updateBoundary(
    @Param('id') id: string,
    @Body() dto: UpdateBoundaryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmsService.updateBoundary(id, dto, user);
  }

  @Post(':id/review-boundary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'AMCOS reviews and approves a mapped farm boundary',
  })
  reviewBoundary(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.farmsService.reviewBoundary(id, user);
  }

  @Post(':id/documents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Link an uploaded file as a document on the farm' })
  addDocument(
    @Param('id') id: string,
    @Body() dto: LinkDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.farmsService.addDocument(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @RequirePermission('farms', 'DELETE')
  @ApiOperation({ summary: 'Delete a farm record (Super Admin only)' })
  remove(@Param('id') id: string) {
    return this.farmsService.remove(id);
  }
}
