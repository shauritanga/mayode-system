import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsIn,
  IsUUID,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/** Super Admin provisions an account and explicitly selects its access role. */
export class CreateStaffUserDto {
  @ApiProperty({ example: '+255768680433' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Phone number must be valid (10-15 digits)',
  })
  phone: string;

  @ApiPropertyOptional({ example: 'officer@mayode.or.tz' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ enum: ['SUPER_ADMIN'], description: 'Only built-in role. Otherwise supply roleId.' })
  @IsIn(['SUPER_ADMIN'])
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Active role created by Super Admin. Required unless creating Super Admin.' })
  @IsUUID()
  @IsOptional()
  roleId?: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({
    example: 'sw',
    description: 'Language preference: sw or en',
  })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({
    description: 'Required for an AMCOS Leader or Field Officer account',
  })
  @IsString()
  @IsOptional()
  mamcosId?: string;

  @ApiPropertyOptional({ description: 'Field Officer operational area' })
  @IsString()
  @IsOptional()
  assignedArea?: string;
}
