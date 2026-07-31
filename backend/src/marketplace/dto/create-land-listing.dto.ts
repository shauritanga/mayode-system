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

  @ApiPropertyOptional({
    example: 0.1,
    description: 'Ignored — the server always derives the commission rate from dealType (STANDARD=10%, FLASH_DEAL=14%, RELATIONSHIP=5%). Kept only for backward compatibility with older clients that still send it.',
    deprecated: true,
  })
  @IsNumber()
  @IsOptional()
  commissionRate?: number;

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

  @ApiPropertyOptional({ example: 'mamcos-staff-uuid', description: 'Desk officer who facilitated this listing (earns the fixed 5,000/- agent fee)' })
  @IsString()
  @IsOptional()
  facilitatedByStaffId?: string;

  @ApiPropertyOptional({ example: 'ANNUAL', enum: ['PREPAID', 'ANNUAL'], description: 'For multi-year leases: pay the full term upfront, or one year at a time' })
  @IsString()
  @IsOptional()
  paymentPlan?: string;
}
