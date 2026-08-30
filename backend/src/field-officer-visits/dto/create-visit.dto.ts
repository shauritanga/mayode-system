import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FieldConditionStatus,
  FieldOfficerVisitPurpose,
  RiceGrowthStage,
} from '@prisma/client';

export class CreateVisitDto {
  @ApiProperty({ example: 'farmer-uuid-1234' })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiProperty({ example: 'farm-uuid-1234' })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiPropertyOptional({ example: 'crop-cycle-uuid-1234' })
  @IsString()
  @IsOptional()
  cropCycleId?: string;

  @ApiPropertyOptional({
    enum: FieldOfficerVisitPurpose,
    example: FieldOfficerVisitPurpose.ROUTINE_CHECK,
  })
  @IsEnum(FieldOfficerVisitPurpose)
  @IsOptional()
  purpose?: FieldOfficerVisitPurpose;

  @ApiPropertyOptional({
    example: '2026-08-30T10:00:00.000Z',
    description: 'Visit date (defaults to now)',
  })
  @IsDateString()
  @IsOptional()
  visitedAt?: string;

  @ApiProperty({ enum: RiceGrowthStage, example: RiceGrowthStage.TILLERING })
  @IsEnum(RiceGrowthStage)
  growthStage: RiceGrowthStage;

  @ApiPropertyOptional({ example: 'SARO 5 (TXD 306)' })
  @IsString()
  @IsOptional()
  riceVariety?: string;

  @ApiProperty({ enum: FieldConditionStatus, example: FieldConditionStatus.GOOD })
  @IsEnum(FieldConditionStatus)
  cropCondition: FieldConditionStatus;

  @ApiPropertyOptional({ enum: FieldConditionStatus })
  @IsEnum(FieldConditionStatus)
  @IsOptional()
  waterStatus?: FieldConditionStatus;

  @ApiPropertyOptional({ enum: FieldConditionStatus })
  @IsEnum(FieldConditionStatus)
  @IsOptional()
  weedStatus?: FieldConditionStatus;

  @ApiPropertyOptional({ enum: FieldConditionStatus })
  @IsEnum(FieldConditionStatus)
  @IsOptional()
  pestStatus?: FieldConditionStatus;

  @ApiPropertyOptional({ enum: FieldConditionStatus })
  @IsEnum(FieldConditionStatus)
  @IsOptional()
  diseaseStatus?: FieldConditionStatus;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  fertilizerApplied?: boolean;

  @ApiPropertyOptional({ example: 'NPK 20:10:10' })
  @IsString()
  @IsOptional()
  inputUsed?: string;

  @ApiPropertyOptional({ example: '50 kg' })
  @IsString()
  @IsOptional()
  inputQuantity?: string;

  @ApiPropertyOptional({ example: 'Crop looks healthy; minor weed pressure on north edge.' })
  @IsString()
  @IsOptional()
  observations?: string;

  @ApiPropertyOptional({ example: 'Apply top-dress fertilizer within 5 days.' })
  @IsString()
  @IsOptional()
  recommendations?: string;

  @ApiPropertyOptional({ example: '2026-09-15T08:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  nextVisitDate?: string;

  /** @deprecated Use observations — kept for older clients */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @ApiPropertyOptional({ example: -8.9199 })
  @IsNumber()
  @IsOptional()
  gpsLatitude?: number;

  @ApiPropertyOptional({ example: 33.4644 })
  @IsNumber()
  @IsOptional()
  gpsLongitude?: number;
}
