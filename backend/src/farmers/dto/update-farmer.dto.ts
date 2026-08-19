import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsEmail,
  IsNumber,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, EducationLevel } from '@prisma/client';

export class UpdateFarmerDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Consent to share credit-readiness data with financial partners',
  })
  @IsBoolean()
  @IsOptional()
  dataShareConsent?: boolean;
  @ApiPropertyOptional({ example: 'John' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsString()
  @IsOptional()
  lastName?: string;

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

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

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

  @ApiPropertyOptional({ example: 12 })
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

  @ApiPropertyOptional({
    example: 'mamcos-uuid',
    description: 'Cooperative (AMCOS) ID',
  })
  @IsString()
  @IsOptional()
  mamcosId?: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsString()
  @IsOptional()
  photoUrl?: string;
}
