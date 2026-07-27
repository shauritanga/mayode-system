import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FarmDataSource } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Farm columns a farmer/officer may suggest a correction for (prompt2 §19). */
export const EDITABLE_FARM_FIELDS = [
  'name',
  'plotNumber',
  'blockNumber',
  'section',
  'village',
  'ward',
  'district',
  'region',
  'socialHectares',
  'ownerName',
  'ownerPhone',
  'waterSource',
  'soilType',
  'soilCondition',
  'accessibility',
] as const;

export class SubmitFarmUpdateDto {
  @ApiProperty({ enum: EDITABLE_FARM_FIELDS, example: 'waterSource' })
  @IsIn(EDITABLE_FARM_FIELDS)
  fieldName: string;

  @ApiProperty({ example: 'Irrigation canal (Kanal 3)' })
  @IsString()
  @IsNotEmpty()
  suggestedValue: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ReviewFarmUpdateDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'MERGED'] })
  @IsIn(['APPROVED', 'REJECTED', 'MERGED'])
  decision: 'APPROVED' | 'REJECTED' | 'MERGED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class RecordFarmDataValueDto {
  @ApiProperty({ example: 'roadDistanceMeters' })
  @IsString()
  @IsNotEmpty()
  fieldName: string;

  @ApiProperty({ example: '350' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ enum: FarmDataSource })
  @IsEnum(FarmDataSource)
  sourceType: FarmDataSource;

  @ApiPropertyOptional({
    description: 'ID of the AMCOS, officer, or user that provided this value',
  })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidenceLevel?: number;
}

export class ResolveFarmDataConflictDto {
  @ApiProperty({ description: 'ID of the FarmDataValue that is correct' })
  @IsString()
  @IsNotEmpty()
  approvedValueId: string;
}
