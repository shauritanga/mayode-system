import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmReportsService } from './farm-reports.service';
import { AddFarmPhotoDto, CreateFieldSurveyDto } from './dto/farm-reports.dto';

@ApiTags('farm-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farms')
export class FarmReportsController {
  constructor(private readonly reports: FarmReportsService) {}

  // ---- Photos ----

  @Post(':id/photos')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Add a farm photo (owner comment §2.5: 3–5 photos)' })
  addPhoto(@Param('id') id: string, @Body() dto: AddFarmPhotoDto, @CurrentUser() user: RequestUser) {
    return this.reports.addPhoto(id, dto, user);
  }

  @Get(':id/photos')
  @ApiOperation({ summary: 'List a farm’s photos' })
  listPhotos(@Param('id') id: string) {
    return this.reports.listPhotos(id);
  }

  @Delete('photos/:photoId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Delete a farm photo' })
  deletePhoto(@Param('photoId') photoId: string, @CurrentUser() user: RequestUser) {
    return this.reports.deletePhoto(photoId, user);
  }

  // ---- Field survey (MAYODE field data collection) ----

  @Post(':id/field-surveys')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Record on-site field data — soil, road, water, physical (staff)' })
  createSurvey(@Param('id') id: string, @Body() dto: CreateFieldSurveyDto, @CurrentUser() user: RequestUser) {
    return this.reports.createFieldSurvey(id, dto, user);
  }

  @Get(':id/field-surveys')
  @ApiOperation({ summary: 'List a farm’s field surveys' })
  listSurveys(@Param('id') id: string) {
    return this.reports.listFieldSurveys(id);
  }

  // ---- Report ----

  @Get(':id/report')
  @ApiOperation({
    summary:
      'Comprehensive farm analytics report. Premium — free users get a basic preview + membership CTA.',
  })
  report(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reports.getReport(id, user);
  }

  @Get(':id/report.html')
  @Header('Content-Type', 'text/html')
  @ApiOperation({ summary: 'Printable HTML version of the farm analytics report (same premium gate)' })
  reportHtml(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reports.getReportHtml(id, user);
  }
}
