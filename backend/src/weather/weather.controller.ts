import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionResource } from '../auth/role-access';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { WeatherService } from './weather.service';
import { WeatherAlertsService } from './weather-alerts.service';
import { WeatherAreasService } from './weather-areas.service';
import { WeatherCheckService } from './weather-check.service';
import { WeatherAdviceService } from './weather-advice.service';
import { CreateWeatherAlertDto, ForecastQueryDto, UpdateWeatherAlertDto } from './dto/weather.dto';

const ISSUERS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY];

@ApiTags('weather')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('weather')
@Controller('weather')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly alerts: WeatherAlertsService,
    private readonly areas: WeatherAreasService,
    private readonly check: WeatherCheckService,
    private readonly advice: WeatherAdviceService,
  ) {}

  @Get('forecast')
  @RequirePermission('weather', 'VIEW')
  @ApiOperation({ summary: 'Live 7-day forecast + flood/drought risk flags for a coordinate (Open-Meteo)' })
  getForecast(@Query() query: ForecastQueryDto) {
    return this.weather.getForecast(query.lat, query.lon);
  }

  @Get('rainfall')
  @RequirePermission('weather', 'VIEW')
  @ApiOperation({ summary: 'Last 30 days of rain against the same days in the past three years' })
  rainfall(@Query() query: ForecastQueryDto) {
    return this.weather.rainfall(query.lat, query.lon);
  }

  @Get('areas')
  @Roles(...ISSUERS, UserRole.FIELD_OFFICER, UserRole.AUDITOR)
  @RequirePermission('weather', 'VIEW')
  @ApiOperation({ summary: 'Where farmers grow, the stage of their crops, and each place’s forecast summary' })
  async listAreas(@CurrentUser() user: RequestUser) {
    const areas = await this.areas.areas(user.role === UserRole.SUPER_ADMIN ? null : (user.mamcosId ?? '__none__'));
    return Promise.all(areas.map(async (a) => ({ ...a, outlook: await this.weather.placeOutlook(a.region, a.district).catch(() => null) })));
  }

  @Get('alerts')
  @Roles(...ISSUERS, UserRole.AUDITOR, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @RequirePermission('weather', 'VIEW')
  findAllAlerts(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.alerts.list(user, { status });
  }

  @Post('alerts')
  @Roles(...ISSUERS)
  @RequirePermission('weather', 'CREATE')
  @ApiOperation({ summary: 'Write an alert. It is sent at once unless sendNow is false.' })
  createAlert(@CurrentUser() user: RequestUser, @Body() dto: CreateWeatherAlertDto) {
    return this.alerts.create(user, dto);
  }

  @Patch('alerts/:id')
  @Roles(...ISSUERS)
  @RequirePermission('weather', 'EDIT')
  updateAlert(@Param('id') id: string, @Body() dto: UpdateWeatherAlertDto, @CurrentUser() user: RequestUser) {
    return this.alerts.update(id, dto, user);
  }

  @Post('alerts/:id/send')
  @Roles(...ISSUERS)
  @RequirePermission('weather', 'CREATE')
  @ApiOperation({ summary: 'Approve a draft: SMS, app, WhatsApp (if agreed) and the farmers’ field officers' })
  sendAlert(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.send(id, user);
  }

  @Post('alerts/:id/dismiss')
  @Roles(...ISSUERS)
  @RequirePermission('weather', 'EDIT')
  dismissAlert(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.dismiss(id, user);
  }

  @Get('alerts/:id/deliveries')
  @Roles(...ISSUERS, UserRole.AUDITOR)
  @RequirePermission('weather', 'VIEW')
  deliveries(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.deliveries(id, user);
  }

  @Post('check')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Run the daily forecast check now (drafts alerts for review)' })
  runCheck() {
    return this.check.run();
  }

  @Get('advice/me')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'This week’s forecast and what to do on each of my crops' })
  myAdvice(@CurrentUser() user: RequestUser) {
    return this.advice.forUser(user.id);
  }

  @Get('preferences/me')
  @Roles(UserRole.FARMER)
  myPreferences(@CurrentUser() user: RequestUser) {
    return this.alerts.preferences(user);
  }

  @Patch('preferences/me')
  @Roles(UserRole.FARMER)
  setMyPreferences(@CurrentUser() user: RequestUser, @Body('whatsappOptIn') whatsappOptIn: boolean) {
    return this.alerts.setWhatsapp(user, !!whatsappOptIn);
  }

  @Patch('preferences/farmer/:farmerId')
  @Roles(...ISSUERS, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Staff record that a farmer agreed (or declined) WhatsApp alerts' })
  setFarmerPreferences(@Param('farmerId') farmerId: string, @Body('whatsappOptIn') whatsappOptIn: boolean, @CurrentUser() user: RequestUser) {
    return this.alerts.setWhatsapp(user, !!whatsappOptIn, farmerId);
  }
}
