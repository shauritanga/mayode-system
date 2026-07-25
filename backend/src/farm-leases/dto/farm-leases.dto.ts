import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
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

  @ApiProperty({ example: '+255712345678', description: "Renter's phone number" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'renterPhone must be a valid phone number' })
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
}

export class OfficerVerifyLeaseDto {
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
