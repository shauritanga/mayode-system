import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsEnum,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';

/** Field-officer approves a farmer after on-site review. */
export class VerifyFarmerDto {
  @ApiPropertyOptional({ example: true, description: 'GPS location confirmed on-site' })
  @IsBoolean()
  @IsOptional()
  gpsVerified?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Identity documents reviewed' })
  @IsBoolean()
  @IsOptional()
  documentsReviewed?: boolean;

  @ApiPropertyOptional({ example: -8.8925 })
  @IsNumber()
  @IsOptional()
  gpsLatitude?: number;

  @ApiPropertyOptional({ example: 34.5035 })
  @IsNumber()
  @IsOptional()
  gpsLongitude?: number;

  @ApiPropertyOptional({ example: 'Met farmer at residence; NIDA card matches; plot walked.' })
  @IsString()
  @IsOptional()
  notes?: string;
}

/** Field-officer rejects a farmer application. */
export class RejectFarmerDto {
  @ApiProperty({ example: 'National ID could not be verified against NIDA records.' })
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;

  @ApiPropertyOptional({ example: 'Advised farmer to re-apply with a valid ID.' })
  @IsString()
  @IsOptional()
  notes?: string;
}

/** Suspend an already-registered farmer. */
export class SuspendFarmerDto {
  @ApiProperty({ example: 'Suspected duplicate registration under two control numbers.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

/** Create/replace the household record for a farmer. */
export class UpsertHouseholdDto {
  @ApiPropertyOptional({ example: 6 })
  @IsInt()
  @Min(0)
  @IsOptional()
  householdSize?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsInt()
  @Min(0)
  @IsOptional()
  dependents?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(0)
  @IsOptional()
  adultsCount?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsInt()
  @Min(0)
  @IsOptional()
  childrenCount?: number;

  @ApiPropertyOptional({ example: 'Rice farming' })
  @IsString()
  @IsOptional()
  primaryIncomeSource?: string;
}

/** Link a previously-uploaded file as a typed document on the farmer. */
export class LinkDocumentDto {
  @ApiProperty({ example: 'NATIONAL_ID', enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty({ example: '/uploads/1720000000-uuid.jpg' })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty({ example: 'nida-card.jpg' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({ example: 245678 })
  @IsInt()
  @IsOptional()
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 'Front side of national ID' })
  @IsString()
  @IsOptional()
  notes?: string;
}

/** Farmer submits final-stage identity verification (owner comment §2.1). */
export class SubmitIdentityDto {
  @ApiProperty({
    enum: [DocumentType.NIDA_ID, DocumentType.VOTER_ID],
    example: DocumentType.NIDA_ID,
    description: 'Type of identity document',
  })
  @IsEnum(DocumentType)
  idType: DocumentType;

  @ApiProperty({ example: '19900101-12345-00001-23', description: 'ID document number' })
  @IsString()
  @IsNotEmpty()
  idNumber: string;

  @ApiProperty({ example: '/uploads/nida-front.jpg', description: 'Uploaded ID document photo URL' })
  @IsString()
  @IsNotEmpty()
  idDocumentUrl: string;

  @ApiProperty({ example: '/uploads/selfie.jpg', description: 'Recent photograph / guided face-capture URL' })
  @IsString()
  @IsNotEmpty()
  faceCaptureUrl: string;

  @ApiPropertyOptional({ example: '/uploads/profile.jpg', description: 'Optional profile photo URL' })
  @IsString()
  @IsOptional()
  profilePhotoUrl?: string;
}
