import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfficerVerificationMethod, VerificationStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateFarmLeaseDto {
  @ApiProperty({ description: 'Farm being leased' })
  @IsUUID()
  farmId: string;

  @ApiProperty({ description: 'Farming season the lease covers' })
  @IsUUID()
  farmingSeasonId: string;

  @ApiProperty({
    example: '+255712345678',
    description: "Renter's phone number",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'renterPhone must be a valid phone number',
  })
  renterPhone: string;

  @ApiPropertyOptional({ example: 'John Mushi' })
  @IsOptional()
  @IsString()
  renterName?: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  leaseStartDate: string;

  @ApiProperty({ example: '2027-06-30' })
  @IsDateString()
  leaseEndDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '/uploads/lease-agreement.pdf',
    description: 'Rental agreement document, if any',
  })
  @IsOptional()
  @IsString()
  agreementDocumentUrl?: string;
}

/**
 * Officer-assisted verification decision (owner comment §8 / prompt.md §10).
 * The officer must record who they contacted, how, what evidence they saw,
 * and a final decision — not just a bare "verified" flag.
 */
export class OfficerVerifyLeaseDto {
  @ApiProperty({
    enum: [
      VerificationStatus.VERIFIED,
      VerificationStatus.REJECTED,
      VerificationStatus.NEEDS_MORE_INFO,
      VerificationStatus.DISPUTED,
    ],
    description: 'Final decision for this verification pass',
  })
  @IsEnum(VerificationStatus)
  decision: VerificationStatus;

  @ApiProperty({
    enum: OfficerVerificationMethod,
    description: 'How the officer verified this lease',
  })
  @IsEnum(OfficerVerificationMethod)
  method: OfficerVerificationMethod;

  @ApiPropertyOptional({ example: 'Juma Mwakalinga (block leader)' })
  @IsOptional()
  @IsString()
  contactedName?: string;

  @ApiPropertyOptional({ example: '+255713000000' })
  @IsOptional()
  @IsString()
  contactedPhone?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Supporting evidence: photos, documents, call recordings (uploaded URLs)',
    example: ['/uploads/verification-photo.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];

  @ApiPropertyOptional({ example: 'Confirmed with block leader by phone' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SelfOperateDto {
  @ApiProperty({ description: 'Farm the owner will farm themselves' })
  @IsUUID()
  farmId: string;

  @ApiProperty({ description: 'Farming season' })
  @IsUUID()
  farmingSeasonId: string;
}

export class ConfirmOwnershipDto {
  @ApiPropertyOptional({ example: 'Details are correct' })
  @IsOptional()
  @IsString()
  notes?: string;
}
