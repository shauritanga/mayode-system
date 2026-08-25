import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
