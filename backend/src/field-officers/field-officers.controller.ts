import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FieldOfficersService } from './field-officers.service';
import {
  AssignOfficerWorkDto,
  CreateFieldOfficerDto,
  UpdateFieldOfficerDto,
} from './dto/field-officers.dto';

const VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];
const MANAGE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MAMCOS_SECRETARY,
];

@ApiTags('field-officers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('field-officers')
export class FieldOfficersController {
  constructor(private readonly service: FieldOfficersService) {}

  @Post('me/sync')
  @Roles(UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Mobile app: record that the officer just synced' })
  recordSync(@CurrentUser() user: RequestUser) {
    return this.service.recordSync(user);
  }

  @Post()
  @RequirePermission('users', 'CREATE')
  @ApiOperation({ summary: 'Create a field officer, generate a temporary password and text the sign-in details' })
  create(@Body() dto: CreateFieldOfficerDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Post(':id/resend-credentials')
  @RequirePermission('users', 'EDIT')
  @ApiOperation({ summary: 'Issue a new temporary password and text it to the officer' })
  resendCredentials(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.resendCredentials(id, user);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  @ApiOperation({ summary: 'Field officers with assignment and performance figures' })
  list(@CurrentUser() user: RequestUser) {
    return this.service.list(user);
  }

  @Get('unassigned')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Farmers and farms with no field officer yet' })
  unassigned(@CurrentUser() user: RequestUser) {
    return this.service.unassigned(user);
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @ApiOperation({ summary: 'One field officer with assigned farmers, farms and recent visits' })
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.detail(id, user);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Update an officer profile (name, region, district, area)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFieldOfficerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/assign')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Assign or release farmers and farms for an officer' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignOfficerWorkDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.assign(id, dto, user);
  }
}
