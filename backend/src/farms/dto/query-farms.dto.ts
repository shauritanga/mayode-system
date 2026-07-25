import { IsString, IsOptional, IsEnum, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FarmGrade } from '@prisma/client';

export class QueryFarmsDto {
  @ApiPropertyOptional({ description: 'Search by farm code or name' })
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

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ enum: FarmGrade })
  @IsEnum(FarmGrade)
  @IsOptional()
  grade?: FarmGrade;

  @ApiPropertyOptional({ description: '"true" | "false" — verified status' })
  @IsBooleanString()
  @IsOptional()
  isVerified?: string;
}
