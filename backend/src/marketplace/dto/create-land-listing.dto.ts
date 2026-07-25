import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealType } from '@prisma/client';

export class CreateLandListingDto {
  @ApiProperty({ example: 'farm-uuid-here', description: 'ID of the Farm being listed' })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiProperty({ example: 'farmer-uuid-here', description: 'ID of the Farmer owning the land' })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ example: 500000, description: 'Asking price in TZS for the lease duration' })
  @IsNumber()
  @Min(0)
  askingPrice: number;

  @ApiPropertyOptional({ example: 480000, description: 'M-LAX AI suggested fair price' })
  @IsNumber()
  @IsOptional()
  suggestedPrice?: number;

  @ApiProperty({ example: DealType.STANDARD, enum: DealType, description: 'Type of deal (STANDARD, FLASH_DEAL, RELATIONSHIP)' })
  @IsEnum(DealType)
  dealType: DealType;

  @ApiProperty({ example: 0.05, description: 'M-LAX platform commission rate (e.g., 0.05 for 5%)' })
  @IsNumber()
  @Min(0)
  commissionRate: number;

  @ApiProperty({ example: 12, description: 'Lease duration in months' })
  @IsNumber()
  @Min(1)
  leaseDurationMonths: number;

  @ApiPropertyOptional({ example: false, description: 'Whether this is an urgent flash deal' })
  @IsBoolean()
  @IsOptional()
  isFlashDeal?: boolean;

  @ApiPropertyOptional({ example: 'MYD-00002', description: 'Preferred renter control number for relationship deals' })
  @IsString()
  @IsOptional()
  preferredRenterCode?: string;

  @ApiPropertyOptional({ example: false, description: 'Whether this is a multi-year agreement' })
  @IsBoolean()
  @IsOptional()
  isMultiYear?: boolean;

  @ApiPropertyOptional({ example: 'FIXED_SEASONAL', description: 'Pricing model description' })
  @IsString()
  @IsOptional()
  pricingModel?: string;

  @ApiPropertyOptional({ example: 450000, description: 'Automated price drop floor if not rented' })
  @IsNumber()
  @IsOptional()
  autoDropPrice?: number;

  @ApiPropertyOptional({ example: 14, description: 'Days after which price automatically drops' })
  @IsNumber()
  @IsOptional()
  autoDropDays?: number;
}
