import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CaptureConsentDto {
  @IsString()
  scope: string;

  @IsBoolean()
  @IsOptional()
  granted?: boolean;

  @IsString()
  @IsOptional()
  formVersion?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  signatureUrl?: string;

  @IsString()
  @IsOptional()
  thumbprintUrl?: string;

  @IsString()
  @IsOptional()
  witnessName?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  capturedAt?: string;
}

export class CreateQuestionnaireDto {
  @IsString()
  @IsOptional()
  farmId?: string;

  @IsString()
  @IsOptional()
  formVersion?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  officialUse?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  farmerSnapshot?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  farmRegistration?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  plantingInputs?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  midSeasonCosts?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  harvestSales?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  consentAcknowledged?: boolean;

  @IsString()
  @IsOptional()
  signatureUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @IsNumber()
  @IsOptional()
  gpsLatitude?: number;

  @IsNumber()
  @IsOptional()
  gpsLongitude?: number;

  @IsDateString()
  @IsOptional()
  capturedAt?: string;
}
