import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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

  @ApiPropertyOptional({ description: 'Swahili wording, used for farmers whose language is Swahili' })
  @IsOptional()
  @IsString()
  titleSw?: string;

  @IsOptional()
  @IsString()
  messageSw?: string;

  @ApiPropertyOptional({ description: 'Super Admin only: limit to one cooperative. Cooperative staff always send to their own.' })
  @IsOptional()
  @IsString()
  mamcosId?: string;

  @ApiPropertyOptional({ description: 'false keeps the alert as a draft for review' })
  @IsOptional()
  @IsBoolean()
  sendNow?: boolean;
}

export class UpdateWeatherAlertDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() titleSw?: string;
  @IsOptional() @IsString() messageSw?: string;
  @IsOptional() @IsEnum(WeatherAlertSeverity) severity?: WeatherAlertSeverity;
  @IsOptional() @IsDateString() validUntil?: string;
}

export class ForecastQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
