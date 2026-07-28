import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsEnum,
  IsArray,
  IsObject,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CropCycleStatus, ActivityType } from '@prisma/client';

export class CreateCropCycleDto {
  @ApiProperty({
    example: 'farm-uuid-1234',
    description: 'ID of the farm where the crop cycle takes place',
  })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiPropertyOptional({
    example: 'farmer-uuid-5678',
    description:
      "Owning farmer. Ignored for farmer-role requests — always derived from the farm to prevent spoofing; usable by staff creating on a farmer's behalf.",
  })
  @IsString()
  @IsOptional()
  farmerId?: string;

  @ApiProperty({
    example: '2026/2027 Masika',
    description: 'Farming season identifier',
  })
  @IsString()
  @IsNotEmpty()
  season: string;

  @ApiPropertyOptional({
    example: 'SARO 5 (TXD 306)',
    description: 'Rice variety planted',
  })
  @IsString()
  @IsOptional()
  riceVariety?: string;

  @ApiPropertyOptional({
    example: '2026-12-15T08:00:00Z',
    description: 'Planting date',
  })
  @IsDateString()
  @IsOptional()
  plantingDate?: string;

  @ApiPropertyOptional({
    example: '2027-05-20T08:00:00Z',
    description: 'Expected harvest date',
  })
  @IsDateString()
  @IsOptional()
  expectedHarvest?: string;

  @ApiPropertyOptional({
    example: 4500.5,
    description: 'Estimated yield in kilograms',
  })
  @IsNumber()
  @IsOptional()
  estimatedYieldKg?: number;
}

export class UpdateCropCycleDto {
  @ApiPropertyOptional({ example: 'SARO 5 (TXD 306)' })
  @IsString()
  @IsOptional()
  riceVariety?: string;

  @ApiPropertyOptional({ example: '2026-12-15T08:00:00Z' })
  @IsDateString()
  @IsOptional()
  plantingDate?: string;

  @ApiPropertyOptional({ example: '2027-05-20T08:00:00Z' })
  @IsDateString()
  @IsOptional()
  expectedHarvest?: string;

  @ApiPropertyOptional({
    example: '2027-05-25T10:00:00Z',
    description: 'Actual harvest date',
  })
  @IsDateString()
  @IsOptional()
  harvestDate?: string;

  @ApiPropertyOptional({ example: 4500.5 })
  @IsNumber()
  @IsOptional()
  estimatedYieldKg?: number;

  @ApiPropertyOptional({
    example: 4850.0,
    description: 'Actual yield harvested in kilograms',
  })
  @IsNumber()
  @IsOptional()
  actualYieldKg?: number;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: CropCycleStatus })
  @IsEnum(CropCycleStatus)
  @IsOptional()
  status?: CropCycleStatus;
}

export class CreateActivityLogDto {
  @ApiProperty({
    example: 'crop-cycle-uuid-1234',
    description: 'ID of the active crop cycle',
  })
  @IsString()
  @IsNotEmpty()
  cropCycleId: string;

  @ApiProperty({
    example: 'LAND_PREPARATION',
    enum: ActivityType,
    description: 'Type of farming activity performed',
  })
  @IsEnum(ActivityType)
  activityType: ActivityType;

  @ApiProperty({
    example: '2026-11-10T09:00:00Z',
    description: 'Timestamp of the activity',
  })
  @IsDateString()
  activityDate: string;

  @ApiPropertyOptional({
    example:
      'Completed initial deep plowing and harrowing using hired tractor.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: {
      fertilizerType: 'NPK 20:10:10',
      quantityKg: 50,
      applicationMethod: 'Broadcasting',
    },
    description: 'JSON object detailing farming inputs utilized',
  })
  @IsObject()
  @IsOptional()
  inputsUsed?: Record<string, any>;

  @ApiPropertyOptional({
    example: 4,
    description: 'Number of laborers employed for this activity',
  })
  @IsInt()
  @IsOptional()
  laborWorkers?: number;

  @ApiPropertyOptional({
    example: 32.5,
    description: 'Total labor man-hours spent',
  })
  @IsNumber()
  @IsOptional()
  laborHours?: number;

  @ApiPropertyOptional({
    example: ['https://example.com/activity1.jpg'],
    description: 'Activity photo proof URLs',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @ApiPropertyOptional({ example: -8.8925 })
  @IsNumber()
  @IsOptional()
  gpsLatitude?: number;

  @ApiPropertyOptional({ example: 34.5035 })
  @IsNumber()
  @IsOptional()
  gpsLongitude?: number;
}

export class CalendarQueryDto {
  @ApiPropertyOptional({ description: 'ISO date, inclusive lower bound; defaults to start of current month' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive upper bound; defaults to end of current month' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
