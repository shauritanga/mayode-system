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
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingsService } from './settings.service';
import {
  UpdateOrgSettingsDto,
  UpsertNotificationTemplateDto,
} from './dto/settings.dto';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('org')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getOrgSettings() {
    return this.settings.getOrgSettings();
  }

  @Put('org')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateOrgSettings(@Body() dto: UpdateOrgSettingsDto) {
    return this.settings.updateOrgSettings(dto);
  }

  @Post('notification-templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createTemplate(@Body() dto: UpsertNotificationTemplateDto) {
    return this.settings.createTemplate(dto);
  }

  @Get('notification-templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAllTemplates() {
    return this.settings.findAllTemplates();
  }

  @Patch('notification-templates/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpsertNotificationTemplateDto,
  ) {
    return this.settings.updateTemplate(id, dto);
  }

  @Delete('notification-templates/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  removeTemplate(@Param('id') id: string) {
    return this.settings.removeTemplate(id);
  }
}
