import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsUUID,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Authenticated staff/admin account creation (SUPER_ADMIN/ADMIN only — see
 * AuthController.createStaffAccount). Unlike the public RegisterDto, this
 * accepts any role, since it's gated by RolesGuard rather than open to the
 * internet.
 */
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

  @ApiProperty({ example: 'ADMIN', enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'Optional custom Role (from Role Management) to assign alongside the system role, for finer-grained resource permissions',
  })
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
