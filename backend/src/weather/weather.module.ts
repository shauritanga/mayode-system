import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { WeatherAlertsService } from './weather-alerts.service';
import { WeatherAreasService } from './weather-areas.service';
import { WeatherCheckService } from './weather-check.service';
import { WeatherAdviceService } from './weather-advice.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [WeatherController],
  providers: [WeatherService, WeatherAlertsService, WeatherAreasService, WeatherCheckService, WeatherAdviceService],
  exports: [WeatherService, WeatherAdviceService, WeatherAlertsService],
})
export class WeatherModule {}
