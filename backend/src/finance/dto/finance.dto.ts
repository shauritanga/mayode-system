import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CostCategory, RevenueType } from '@prisma/client';

export class CreateInputCostDto {
  @ApiProperty({
    example: 'crop-cycle-uuid-1234',
    description: 'ID of the active crop cycle',
  })
  @IsString()
  @IsNotEmpty()
  cropCycleId: string;

  @ApiProperty({
    example: 'FERTILIZER',
    enum: CostCategory,
    description: 'Category of production cost',
  })
  @IsEnum(CostCategory)
  category: CostCategory;

  @ApiProperty({ example: 'NPK 20:10:10 Fertilizer Bags' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ example: 'Bags (50kg)' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({
    example: 75000.0,
    description: 'Price per unit in TZS',
  })
  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @ApiProperty({ example: 750000.0, description: 'Total cost incurred in TZS' })
  @IsNumber()
  totalCost: number;

  @ApiPropertyOptional({ example: 'Mbarali Agro-Suppliers Ltd' })
  @IsString()
  @IsOptional()
  supplier?: string;

  @ApiPropertyOptional({ example: 'https://example.com/receipt1.jpg' })
  @IsString()
  @IsOptional()
  receiptUrl?: string;

  @ApiProperty({
    example: '2026-11-15T10:00:00Z',
    description: 'Date the cost was incurred',
  })
  @IsDateString()
  dateIncurred: string;
}

export class CreateRevenueDto {
  @ApiProperty({
    example: 'crop-cycle-uuid-1234',
    description: 'ID of the active crop cycle',
  })
  @IsString()
  @IsNotEmpty()
  cropCycleId: string;

  @ApiProperty({
    example: 'FAIRTRADE_SALE',
    enum: RevenueType,
    description: 'Type of revenue sale',
  })
  @IsEnum(RevenueType)
  revenueType: RevenueType;

  @ApiProperty({
    example: 4850.0,
    description: 'Quantity of rice sold in kilograms',
  })
  @IsNumber()
  quantityKg: number;

  @ApiProperty({
    example: 1200.0,
    description: 'Selling price per kilogram in TZS',
  })
  @IsNumber()
  pricePerKg: number;

  @ApiProperty({
    example: 5820000.0,
    description: 'Total gross revenue in TZS',
  })
  @IsNumber()
  totalRevenue: number;

  @ApiPropertyOptional({
    example: 242500.0,
    description: 'Fairtrade premium earned in TZS',
  })
  @IsNumber()
  @IsOptional()
  fairtradePremium?: number;

  @ApiPropertyOptional({
    example: 'buyer-uuid-5678',
    description: 'ID of the verified buyer',
  })
  @IsString()
  @IsOptional()
  buyerId?: string;

  @ApiProperty({ example: '2027-05-30T14:00:00Z', description: 'Date of sale' })
  @IsDateString()
  saleDate: string;
}
