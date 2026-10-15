import { IsString, IsOptional, IsEnum, IsBooleanString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FarmGrade, OwnershipType } from '@prisma/client';

export class QueryFarmsDto {
  @ApiPropertyOptional({ description: 'Search by farm code, name or farmer' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Cooperative (AMCOS) ID' })
  @IsString()
  @IsOptional()
  mamcosId?: string;

  @ApiPropertyOptional({ description: 'Filter by owning farmer' })
  @IsString()
  @IsOptional()
  farmerId?: string;

  @ApiPropertyOptional({ example: 'Mbeya' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  ward?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ example: 'Mlimani' })
  @IsString()
  @IsOptional()
  subVillage?: string;

  @ApiPropertyOptional({ enum: FarmGrade })
  @IsEnum(FarmGrade)
  @IsOptional()
  grade?: FarmGrade;

  @ApiPropertyOptional({ enum: OwnershipType })
  @IsEnum(OwnershipType)
  @IsOptional()
  ownershipType?: OwnershipType;

  @ApiPropertyOptional({ description: 'Water source (exact match)' })
  @IsString()
  @IsOptional()
  waterSource?: string;

  @ApiPropertyOptional({ enum: ['irrigated', 'rain-fed'] })
  @IsIn(['irrigated', 'rain-fed'])
  @IsOptional()
  production?: 'irrigated' | 'rain-fed';

  @ApiPropertyOptional({ description: 'Rice variety grown in any crop cycle on the farm' })
  @IsString()
  @IsOptional()
  riceVariety?: string;

  @ApiPropertyOptional({ description: '"true" | "false" — verified status' })
  @IsBooleanString()
  @IsOptional()
  isVerified?: string;
}
