import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateFieldOfficerDto {
  @ApiPropertyOptional() @IsString() @IsOptional() firstName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() lastName?: string;
  @ApiPropertyOptional({ example: 'Mbeya' }) @IsString() @IsOptional() region?: string;
  @ApiPropertyOptional({ example: 'Mbarali' }) @IsString() @IsOptional() district?: string;
  @ApiPropertyOptional({ description: 'Free-text patch, e.g. wards or villages covered' })
  @IsString()
  @IsOptional()
  assignedArea?: string;
}

export class AssignOfficerWorkDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  farmerIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  farmIds?: string[];

  @ApiPropertyOptional({ description: 'Release these records from the officer instead of assigning them' })
  @IsBoolean()
  @IsOptional()
  unassign?: boolean;
}
