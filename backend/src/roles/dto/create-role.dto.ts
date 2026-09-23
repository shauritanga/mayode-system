import { UserRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class CreateRoleDto {
  @ApiPropertyOptional({ description: 'Operational profile for related records; grants no permissions', enum: ['CUSTOM', 'FARMER', 'FIELD_OFFICER', 'MAMCOS_SECRETARY', 'AUDITOR', 'BUYER', 'FINANCIAL_PROVIDER'] })
  @IsOptional()
  @IsIn(['CUSTOM', 'FARMER', 'FIELD_OFFICER', 'MAMCOS_SECRETARY', 'AUDITOR', 'BUYER', 'FINANCIAL_PROVIDER'])
  profileType?: UserRole;

  @ApiProperty({ example: 'Regional Auditor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'Read-only access to farmer and farm records for compliance audits' })
  @IsString()
  @IsOptional()
  @MaxLength(280)
  description?: string;
}
