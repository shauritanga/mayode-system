import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldOfficerVisitPurpose } from '@prisma/client';

export class CreateVisitDto {
  @ApiProperty({ example: 'farmer-uuid-1234' })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiPropertyOptional({ example: 'farm-uuid-1234' })
  @IsString()
  @IsOptional()
  farmId?: string;

  @ApiPropertyOptional({ example: 'crop-cycle-uuid-1234' })
  @IsString()
  @IsOptional()
  cropCycleId?: string;

  @ApiProperty({ enum: FieldOfficerVisitPurpose, example: FieldOfficerVisitPurpose.ROUTINE_CHECK })
  @IsEnum(FieldOfficerVisitPurpose)
  purpose: FieldOfficerVisitPurpose;

  @ApiPropertyOptional({ example: 'Discussed fertilizer timing for the current crop cycle.' })
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
