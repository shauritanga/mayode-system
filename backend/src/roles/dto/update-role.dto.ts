import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Regional Auditor' })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'Read-only access to farmer and farm records for compliance audits' })
  @IsString()
  @IsOptional()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
