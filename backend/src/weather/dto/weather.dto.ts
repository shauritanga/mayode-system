import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
} from 'class-validator';
import { WeatherAlertSeverity, WeatherAlertType } from '@prisma/client';

export class CreateWeatherAlertDto {
  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsEnum(WeatherAlertType)
  alertType: WeatherAlertType;

  @IsOptional()
  @IsEnum(WeatherAlertSeverity)
  severity?: WeatherAlertSeverity;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class ForecastQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
