import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  IsObject,
  Min,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FarmGrade, OwnershipType } from '@prisma/client';

export class CreateFarmDto {
  @ApiProperty({
    example: 'farmer-uuid-1234',
    description: 'ID of the farmer owning the farm',
  })
  @IsString()
  farmerId: string;

  @ApiPropertyOptional({
    example: 'mamcos-uuid-5678',
    description: 'MAMCOS scheme ID if applicable',
  })
  @IsString()
  @IsOptional()
  mamcosId?: string;

  @ApiProperty({
    example: 'Plot No. 02, Block 5, South-West Section, Madibira AMCOS',
    description: 'Structured farm name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '02' })
  @IsString()
  @IsOptional()
  plotNumber?: string;

  @ApiPropertyOptional({ example: '5' })
  @IsString()
  @IsOptional()
  blockNumber?: string;

  @ApiPropertyOptional({ example: 'South-West Section' })
  @IsString()
  @IsOptional()
  section?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  ward?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: 'Mbeya' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiProperty({ example: 5.5, description: 'Social land size in hectares' })
  @IsNumber()
  @Min(0.1)
  socialHectares: number;

  @ApiPropertyOptional({
    example: 13.5,
    description: 'Actual measured land size in acres',
  })
  @IsNumber()
  @IsOptional()
  actualAcres?: number;

  @ApiPropertyOptional({
    example: 'B',
    enum: FarmGrade,
    description: 'Initial farm grade assessment',
  })
  @IsEnum(FarmGrade)
  @IsOptional()
  grade?: FarmGrade;

  @ApiPropertyOptional({
    example: 2,
    description: 'Number of anthills (vichuguu) on the farm',
  })
  @IsInt()
  @IsOptional()
  vichuguuCount?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the farm has irrigation infrastructure',
  })
  @IsBoolean()
  @IsOptional()
  irrigationStatus?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the farm is easily accessible near a main road',
  })
  @IsBoolean()
  @IsOptional()
  nearRoadStatus?: boolean;

  @ApiPropertyOptional({
    example: 'Fertile loamy soil with good moisture retention',
  })
  @IsString()
  @IsOptional()
  soilCondition?: string;

  @ApiPropertyOptional({
    example: ['https://example.com/farm1.jpg'],
    description: 'List of photo URLs',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @ApiPropertyOptional({ example: 'OWNED', enum: OwnershipType })
  @IsEnum(OwnershipType)
  @IsOptional()
  ownershipType?: OwnershipType;

  @ApiPropertyOptional({
    example: 'Elisha Mayode',
    description: 'Required when ownershipType is RENTED or LEASED',
  })
  @ValidateIf(
    (o) =>
      o.ownershipType === OwnershipType.RENTED ||
      o.ownershipType === OwnershipType.LEASED,
  )
  @IsString()
  @IsNotEmpty()
  ownerName?: string;

  @ApiPropertyOptional({
    example: '+255712345678',
    description: 'Required when ownershipType is RENTED or LEASED',
  })
  @ValidateIf(
    (o) =>
      o.ownershipType === OwnershipType.RENTED ||
      o.ownershipType === OwnershipType.LEASED,
  )
  @IsString()
  @IsNotEmpty()
  ownerPhone?: string;

  @ApiPropertyOptional({ example: 'Customary right of occupancy' })
  @IsString()
  @IsOptional()
  landTenure?: string;

  @ApiPropertyOptional({ example: 'Clay loam' })
  @IsString()
  @IsOptional()
  soilType?: string;

  @ApiPropertyOptional({ example: 'High' })
  @IsString()
  @IsOptional()
  soilFertility?: string;

  @ApiPropertyOptional({ example: 'Irrigation canal' })
  @IsString()
  @IsOptional()
  waterSource?: string;

  @ApiPropertyOptional({ example: 'Gravity-fed flooding' })
  @IsString()
  @IsOptional()
  irrigationMethod?: string;

  @ApiPropertyOptional({
    example: 'Accessible by motorbike; 2km from feeder road',
  })
  @IsString()
  @IsOptional()
  accessibility?: string;

  @ApiPropertyOptional({
    example: ['Rice', 'Maize'],
    description: 'Previous crops grown',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  previousCrops?: string[];
}

export class UpdateFarmDto {
  @ApiPropertyOptional({ example: 'Shamba la Chini' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '02' })
  @IsString()
  @IsOptional()
  plotNumber?: string;

  @ApiPropertyOptional({ example: '5' })
  @IsString()
  @IsOptional()
  blockNumber?: string;

  @ApiPropertyOptional({ example: 'South-West Section' })
  @IsString()
  @IsOptional()
  section?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  ward?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: 'Mbeya' })
  @IsString()
  @IsOptional()
  region?: string;
  @ApiPropertyOptional({ example: 6.0 })
  @IsNumber()
  @IsOptional()
  socialHectares?: number;

  @ApiPropertyOptional({ example: 14.8 })
  @IsNumber()
  @IsOptional()
  actualAcres?: number;

  @ApiPropertyOptional({ example: 'A', enum: FarmGrade })
  @IsEnum(FarmGrade)
  @IsOptional()
  grade?: FarmGrade;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  vichuguuCount?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  irrigationStatus?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  nearRoadStatus?: boolean;

  @ApiPropertyOptional({
    example: 'Excellent soil fertility after NPK fertilizer application',
  })
  @IsString()
  @IsOptional()
  soilCondition?: string;

  @ApiPropertyOptional({
    example: ['https://example.com/farm1.jpg', 'https://example.com/farm2.jpg'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @ApiPropertyOptional({ example: 'LEASED', enum: OwnershipType })
  @IsEnum(OwnershipType)
  @IsOptional()
  ownershipType?: OwnershipType;

  @ApiPropertyOptional({ example: 'Elisha Mayode' })
  @IsString()
  @IsOptional()
  ownerName?: string;

  @ApiPropertyOptional({ example: '+255712345678' })
  @IsString()
  @IsOptional()
  ownerPhone?: string;

  @ApiPropertyOptional({ example: 'Granted right of occupancy' })
  @IsString()
  @IsOptional()
  landTenure?: string;

  @ApiPropertyOptional({ example: 'Sandy clay' })
  @IsString()
  @IsOptional()
  soilType?: string;

  @ApiPropertyOptional({ example: 'Medium' })
  @IsString()
  @IsOptional()
  soilFertility?: string;

  @ApiPropertyOptional({ example: 'Borehole' })
  @IsString()
  @IsOptional()
  waterSource?: string;

  @ApiPropertyOptional({ example: 'Sprinkler' })
  @IsString()
  @IsOptional()
  irrigationMethod?: string;

  @ApiPropertyOptional({ example: 'Roadside plot, easy truck access' })
  @IsString()
  @IsOptional()
  accessibility?: string;

  @ApiPropertyOptional({ example: ['Rice', 'Beans'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  previousCrops?: string[];
}

export class UpdateBoundaryDto {
  @ApiProperty({
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [34.502, -8.891],
          [34.505, -8.891],
          [34.505, -8.894],
          [34.502, -8.894],
          [34.502, -8.891],
        ],
      ],
    },
    description: 'GeoJSON Polygon representing farm boundary coordinates',
  })
  @IsObject()
  boundaryCoordinates: Record<string, any>;

  @ApiProperty({ example: -8.8925, description: 'Center Latitude' })
  @IsNumber()
  centerLat: number;

  @ApiProperty({ example: 34.5035, description: 'Center Longitude' })
  @IsNumber()
  centerLng: number;
}
