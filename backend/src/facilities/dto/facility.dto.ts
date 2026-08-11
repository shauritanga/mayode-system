import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertIrrigationSchemeDto {
  @IsOptional() @IsString() mamcosId?: string;
  @IsString() name: string;
  @IsOptional() @IsString() schemeType?: string;
  @IsOptional() @IsNumber() coverageHectares?: number;
  @IsOptional() @IsString() waterSource?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateIrrigationSchemeDto extends PartialType(UpsertIrrigationSchemeDto) {}

export class UpsertAggregationCentreDto {
  @IsOptional() @IsString() mamcosId?: string;
  @IsString() name: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() capacityKg?: number;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAggregationCentreDto extends PartialType(UpsertAggregationCentreDto) {}
