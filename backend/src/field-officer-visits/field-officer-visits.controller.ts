import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FieldOfficerVisitsService } from './field-officer-visits.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { CalendarQueryDto, QueryVisitsDto } from './dto/query-visits.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';

@ApiTags('field-officer-visits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('field-officer-visits')
export class FieldOfficerVisitsController {
  constructor(private readonly visits: FieldOfficerVisitsService) {}

  @Post()
  @Roles(UserRole.FIELD_OFFICER)
  @ApiOperation({
    summary:
      'Log a timestamped visit to a farmer (Field Officer only, own AMCOS only)',
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateVisitDto) {
    return this.visits.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all field officer visits across the system (staff only)',
  })
  findAll() {
    return this.visits.findAll();
  }

  @Get('mine')
  @Roles(UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: "The calling officer's own visit history" })
  findMine(@CurrentUser() user: RequestUser, @Query() query: QueryVisitsDto) {
    return this.visits.findMine(user.id, query);
  }

  @Get('calendar')
  @Roles(UserRole.FIELD_OFFICER)
  @ApiOperation({
    summary:
      'Combined calendar: own visits + upcoming crop-cycle milestones for the AMCOS',
  })
  calendar(@CurrentUser() user: RequestUser, @Query() query: CalendarQueryDto) {
    return this.visits.calendar(user.id, query);
  }

  @Get('farmer/:farmerId')
  @Roles(
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Visit history for one farmer' })
  findForFarmer(
    @Param('farmerId') farmerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.visits.findForFarmer(farmerId, user);
  }
}
