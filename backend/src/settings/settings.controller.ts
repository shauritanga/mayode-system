import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SettingsService } from './settings.service';
import {
  UpdateOrgSettingsDto,
  UpsertNotificationTemplateDto,
} from './dto/settings.dto';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('org')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('settings', 'VIEW')
  getOrgSettings() {
    return this.settings.getOrgSettings();
  }

  @Put('org')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('settings', 'EDIT')
  updateOrgSettings(@Body() dto: UpdateOrgSettingsDto) {
    return this.settings.updateOrgSettings(dto);
  }

  @Post('notification-templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('settings', 'CREATE')
  createTemplate(@Body() dto: UpsertNotificationTemplateDto) {
    return this.settings.createTemplate(dto);
  }

  @Get('notification-templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('settings', 'VIEW')
  findAllTemplates() {
    return this.settings.findAllTemplates();
  }

  @Patch('notification-templates/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('settings', 'EDIT')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpsertNotificationTemplateDto,
  ) {
    return this.settings.updateTemplate(id, dto);
  }

  @Delete('notification-templates/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('settings', 'DELETE')
  removeTemplate(@Param('id') id: string) {
    return this.settings.removeTemplate(id);
  }
}
