import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

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

export class CreateFieldOfficerDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName: string;

  @ApiProperty({ example: '+255768680433' })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Phone number must be valid (10-15 digits)' })
  phone: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional({ example: 'Mbeya' }) @IsString() @IsOptional() region?: string;
  @ApiPropertyOptional({ example: 'Mbarali' }) @IsString() @IsOptional() district?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() assignedArea?: string;

  @ApiPropertyOptional({ description: 'The cooperative the officer belongs to. Required when Super Admin creates the officer; a cooperative administrator’s own cooperative is used otherwise.' })
  @IsUUID()
  @IsOptional()
  mamcosId?: string;

  @ApiPropertyOptional({ description: 'Role giving the officer’s dashboard permissions. Defaults to the cooperative’s “Field Officer” role.' })
  @IsUUID()
  @IsOptional()
  roleId?: string;

  @ApiPropertyOptional({ enum: ['sw', 'en'] }) @IsIn(['sw', 'en']) @IsOptional() language?: string;
}
