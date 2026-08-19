import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlotDto {
  @ApiProperty({
    example: 'farm-uuid-1234',
    description: 'ID of the parent farm',
  })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiPropertyOptional({
    example: 'North Paddy',
    description: 'Human-friendly plot name',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Plot size in acres' })
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  sizeAcres?: number;

  @ApiPropertyOptional({ example: 'Clay loam, waterlogged in rains' })
  @IsString()
  @IsOptional()
  soilCondition?: string;

  @ApiPropertyOptional({ example: 'gravity-fed canal' })
  @IsString()
  @IsOptional()
  irrigationStatus?: string;
}

export class UpdatePlotDto {
  @ApiPropertyOptional({ example: 'South Paddy' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 3.0 })
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  sizeAcres?: number;

  @ApiPropertyOptional({ example: 'Sandy loam' })
  @IsString()
  @IsOptional()
  soilCondition?: string;

  @ApiPropertyOptional({ example: 'rain-fed' })
  @IsString()
  @IsOptional()
  irrigationStatus?: string;

  @ApiPropertyOptional({
    example: 'VEGETATIVE',
    description: 'Current crop stage label',
  })
  @IsString()
  @IsOptional()
  currentStage?: string;
}

export class UpdatePlotBoundaryDto {
  @ApiProperty({
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [34.502, -8.891],
          [34.503, -8.891],
          [34.503, -8.892],
          [34.502, -8.892],
          [34.502, -8.891],
        ],
      ],
    },
    description: 'GeoJSON Polygon representing the plot boundary',
  })
  @IsObject()
  boundaryCoordinates: Record<string, any>;

  @ApiProperty({ example: -8.8915, description: 'Center Latitude' })
  @IsNumber()
  centerLat: number;

  @ApiProperty({ example: 34.5025, description: 'Center Longitude' })
  @IsNumber()
  centerLng: number;
}
