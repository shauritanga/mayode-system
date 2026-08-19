import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsIn,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'ADMIN',
    enum: UserRole,
    description: 'Role change — restricted to SUPER_ADMIN callers',
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ example: 'newemail@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Elisha' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Mayode' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: '+255768680433' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: 'en',
    description: 'Language preference: sw or en',
  })
  @IsIn(['sw', 'en'])
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * Self-service profile update (PUT /users/profile). Deliberately omits role
 * and isActive — the global ValidationPipe rejects those fields with 400,
 * so privilege fields can never be changed through this DTO.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Elisha' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Mayode' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: 'newemail@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+255768680433' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: 'en',
    description: 'Language preference: sw or en',
  })
  @IsIn(['sw', 'en'])
  @IsOptional()
  language?: string;
}
