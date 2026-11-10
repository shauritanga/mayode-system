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
  IsUUID,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, EducationLevel, FarmerIdType } from '@prisma/client';

/**
 * Create a farmer on behalf of someone (admin / field officer flow).
 * Provisions the login User + Farmer profile in one transaction.
 */
export class CreateFarmerDto {
  @ApiPropertyOptional({ description: 'AMCOS farmers: the free hectare they already hold. Its code (e.g. 5.15R12) becomes their farmer ID and the hectare is allocated to them.' })
  @IsOptional()
  @IsUUID()
  hectareId?: string;

  @ApiPropertyOptional({ description: 'Optional, with a hectare: an existing member of the same AMCOS who is the real owner of the hectare, which is registered in this farmer\'s name. They become its guardian.' })
  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @ApiPropertyOptional({
    example: '+255700000001',
    description: 'Login phone number (unique). May be left out only when a supervisor who can be reached is named (a member as guardian, or a name and phone below).',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'A supervisor or guardian who is not an AMCOS member (for example a relative with their own number). Needs supervisorPhone.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supervisorName?: string;

  @ApiPropertyOptional({ description: 'Phone of that supervisor; required when supervisorName is given.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  supervisorPhone?: string;

  @ApiPropertyOptional({
    example: 'ChangeMe123',
    description: 'Initial password (min 6 chars). Leave out and the system generates a temporary one and sends it by SMS.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

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
    enum: FarmerIdType,
    example: FarmerIdType.VOTER_ID,
    description: 'Primary ID the farmer registers with. NIDA is optional: a voter ID or driver\'s license is accepted instead. Send with idNumber.',
  })
  @IsEnum(FarmerIdType)
  @IsOptional()
  idType?: FarmerIdType;

  @ApiPropertyOptional({ example: 'T-1234-5678-9012-3', description: 'The number for idType' })
  @IsString()
  @IsOptional()
  idNumber?: string;

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
