import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsEmail,
  IsNumber,
  IsDateString,
  IsNotEmpty,
  IsBoolean,
  MinLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, EducationLevel } from '@prisma/client';

/**
 * Create a farmer on behalf of someone (admin / field officer flow).
 * Provisions the login User + Farmer profile in one transaction.
 */
export class CreateFarmerDto {
  @ApiProperty({
    example: '+255700000001',
    description: 'Login phone number (unique)',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: 'ChangeMe123',
    description: 'Initial password (min 6 chars)',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Recorded farmer consent for approved financial-provider data sharing',
  })
  @IsBoolean()
  @IsOptional()
  dataShareConsent?: boolean;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'MALE', enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-12' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'NIDA-123456789' })
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ApiPropertyOptional({
    example: 'mamcos-uuid',
    description: 'Cooperative (AMCOS) ID',
  })
  @IsString()
  @IsOptional()
  mamcosId?: string;

  @ApiPropertyOptional({ example: 'Madibira' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ example: 'Rujewa' })
  @IsString()
  @IsOptional()
  ward?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: 'Mbeya' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ example: -8.8925 })
  @IsNumber()
  @IsOptional()
  residenceLatitude?: number;

  @ApiPropertyOptional({ example: 34.5035 })
  @IsNumber()
  @IsOptional()
  residenceLongitude?: number;

  @ApiPropertyOptional({ example: 'PRIMARY', enum: EducationLevel })
  @IsEnum(EducationLevel)
  @IsOptional()
  educationLevel?: EducationLevel;

  @ApiPropertyOptional({
    example: 12,
    description: 'Years of farming experience',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  farmingExperienceYears?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsInt()
  @Min(1)
  @IsOptional()
  familySize?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsInt()
  @Min(0)
  @IsOptional()
  dependents?: number;
}
