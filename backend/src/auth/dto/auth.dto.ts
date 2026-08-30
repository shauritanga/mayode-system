import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  FIELD_OFFICER = 'FIELD_OFFICER',
  FARMER = 'FARMER',
  MAMCOS_SECRETARY = 'MAMCOS_SECRETARY',
  AUDITOR = 'AUDITOR',
  BUYER = 'BUYER',
  FINANCIAL_PROVIDER = 'FINANCIAL_PROVIDER',
}

// ---- Register DTO ----
export class RegisterDto {
  @ApiProperty({
    example: '+255768680433',
    description: 'Phone number with country code',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Phone number must be valid (10-15 digits)',
  })
  phone: string;

  @ApiPropertyOptional({ example: 'farmer@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'FARMER', enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ example: 'John' })
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
    example: true,
    description:
      'Whether the farmer has consented to sharing data with approved financial providers',
  })
  @IsBoolean()
  @IsOptional()
  dataShareConsent?: boolean;
}

// ---- Login DTO ----
export class LoginDto {
  @ApiProperty({ example: '+255768680433' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

// ---- Refresh Token DTO ----
export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token received during login' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

// ---- Auth Response ----
export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  user: {
    id: string;
    phone: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    role: string;
    controlNumber?: string;
    profilePhotoUrl?: string;
  };
}
