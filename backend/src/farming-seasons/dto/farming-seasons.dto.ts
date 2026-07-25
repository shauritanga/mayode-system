import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { FarmingSeasonStatus } from '@prisma/client';

export class CreateFarmingSeasonDto {
  @ApiProperty({ example: '2026/2027 Masika' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Cooperative (AMCOS) this season belongs to' })
  @IsOptional()
  @IsUUID()
  mamcosId?: string;

  @ApiPropertyOptional({ example: 'Mbeya' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'Rice' })
  @IsOptional()
  @IsString()
  crop?: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2027-06-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  registrationOpenDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  registrationCloseDate?: string;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsOptional()
  @IsDateString()
  verificationDeadline?: string;

  @ApiPropertyOptional({ enum: FarmingSeasonStatus, default: FarmingSeasonStatus.DRAFT })
  @IsOptional()
  @IsEnum(FarmingSeasonStatus)
  status?: FarmingSeasonStatus;
}

export class UpdateFarmingSeasonDto extends PartialType(CreateFarmingSeasonDto) {}
