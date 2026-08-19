import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class AddFarmPhotoDto {
  @ApiProperty({
    example: '/uploads/farm-north.jpg',
    description: 'Uploaded photo URL',
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ example: 'North boundary' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class CreateFieldSurveyDto {
  @ApiPropertyOptional({ example: 5.8, description: 'Soil pH' })
  @IsOptional()
  @IsNumber()
  soilPh?: number;

  @ApiPropertyOptional({ example: 'Clay loam' })
  @IsOptional()
  @IsString()
  soilTexture?: string;

  @ApiPropertyOptional({ example: 2.4, description: 'Soil organic matter %' })
  @IsOptional()
  @IsNumber()
  soilOrganicMatter?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  soilNotes?: string;

  @ApiPropertyOptional({
    example: 350,
    description: 'Distance to nearest road (m)',
  })
  @IsOptional()
  @IsInt()
  roadDistanceMeters?: number;

  @ApiPropertyOptional({ example: 'FAIR', description: 'GOOD | FAIR | POOR' })
  @IsOptional()
  @IsString()
  roadAccessQuality?: string;

  @ApiPropertyOptional({ example: 'Irrigation canal' })
  @IsOptional()
  @IsString()
  waterSource?: string;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  waterDistanceMeters?: number;

  @ApiPropertyOptional({ example: 'Reliable in wet season' })
  @IsOptional()
  @IsString()
  waterReliability?: string;

  @ApiPropertyOptional({ example: 'Gentle' })
  @IsOptional()
  @IsString()
  slope?: string;

  @ApiPropertyOptional({ example: 'Low' })
  @IsOptional()
  @IsString()
  floodRisk?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
