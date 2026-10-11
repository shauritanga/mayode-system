import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsIn, IsUUID } from 'class-validator';

export class CreateRoleDto {
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

  @ApiPropertyOptional({ description: 'Super Admin only: create the role inside this AMCOS. Cooperative admins always create roles in their own AMCOS.' })
  @IsUUID()
  @IsOptional()
  mamcosId?: string;
}
