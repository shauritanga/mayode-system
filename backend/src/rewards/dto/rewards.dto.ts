import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { RewardType, SelectionMethod } from '@prisma/client';

export class CreateRewardCampaignDto {
  @ApiProperty({ example: 'Annual Fertilizer Support 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'MAYODE Group' })
  @IsOptional()
  @IsString()
  sponsor?: string;

  @ApiProperty({ enum: RewardType, example: RewardType.FERTILIZER })
  @IsEnum(RewardType)
  rewardType: RewardType;

  @ApiPropertyOptional({ example: 4, description: 'Reward quantity per winner (e.g. bags)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  rewardQuantity?: number;

  @ApiProperty({ example: 5, description: 'Number of winners to select' })
  @IsInt()
  @Min(1)
  numberOfWinners: number;

  @ApiPropertyOptional({ description: 'Restrict eligibility to a farming season' })
  @IsOptional()
  @IsUUID()
  farmingSeasonId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Restrict to these cooperative (AMCOS) IDs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleCooperatives?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  eligibilityStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  eligibilityEndDate?: string;

  @ApiPropertyOptional({ enum: SelectionMethod, default: SelectionMethod.RANDOM })
  @IsOptional()
  @IsEnum(SelectionMethod)
  selectionMethod?: SelectionMethod;
}
