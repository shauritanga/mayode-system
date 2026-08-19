import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { WeatherService } from './weather.service';
import { CreateWeatherAlertDto, ForecastQueryDto } from './dto/weather.dto';

@ApiTags('weather')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('forecast')
  @ApiOperation({
    summary:
      'Live 7-day forecast + flood/drought risk flags for a coordinate (Open-Meteo)',
  })
  getForecast(@Query() query: ForecastQueryDto) {
    return this.weather.getForecast(query.lat, query.lon);
  }

  @Post('alerts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Issue an early-warning alert, broadcast via SMS to farmers in the affected area',
  })
  createAlert(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateWeatherAlertDto,
  ) {
    return this.weather.createAlert(user.id, dto);
  }

  @Get('alerts')
  findAllAlerts() {
    return this.weather.findAllAlerts();
  }
}
