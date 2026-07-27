import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateDisputeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leaseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  farmingSeasonId?: string;

  @ApiProperty({ enum: DisputeType })
  @IsEnum(DisputeType)
  type: DisputeType;

  @ApiProperty({
    example:
      'Two people both claim to be renting plot MAMCOS-B03-P014 this season.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Farmer IDs involved in the dispute',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  claimantIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedOfficerId?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({
    example: 'RESOLVED',
    enum: [
      'RESOLVED',
      'REJECTED',
      'ESCALATED',
      'UNDER_REVIEW',
      'FIELD_VERIFICATION_REQUIRED',
    ],
  })
  @IsString()
  status:
    | 'RESOLVED'
    | 'REJECTED'
    | 'ESCALATED'
    | 'UNDER_REVIEW'
    | 'FIELD_VERIFICATION_REQUIRED';

  @ApiPropertyOptional({
    example:
      'Block leader confirmed the second claimant is the correct renter.',
  })
  @IsOptional()
  @IsString()
  resolution?: string;
}
