import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRiceVarietyDto {
  @ApiProperty({ example: 'SARO 5 (TXD 306)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'SARO5' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({
    example: 120,
    description:
      'Days from planting to harvest. Used to work out the harvest date when only a planting date is known.',
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(365)
  maturityDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateRiceVarietyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(365)
  maturityDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional({
    description:
      'false hides the variety from new crop cycles; existing cycles keep it.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
