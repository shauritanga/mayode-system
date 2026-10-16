import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsPositive,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';

export class CreateInventoryRecordDto {
  @ApiProperty({
    example: 'farm-uuid-1234',
    description: 'ID of the verified farm',
  })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiProperty({
    example: 'farmer-uuid-5678',
    description: 'ID of the farmer supplying the harvest',
  })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiPropertyOptional({
    example: 'crop-cycle-uuid',
    description:
      'Source crop cycle. Required when the Mbalari calendar is active for the farm.',
  })
  @IsString()
  @IsOptional()
  cropCycleId?: string;

  @ApiProperty({
    example: 450.5,
    description: 'Net weight of the received harvest in kilograms',
  })
  @IsNumber()
  weightKg: number;

  @ApiPropertyOptional({
    example: 'Grade 1 Premium',
    description: 'Assessed quality grade of the rice',
  })
  @IsString()
  @IsOptional()
  qualityGrade?: string;

  @ApiPropertyOptional({
    example: 13.5,
    description: 'Moisture content percentage measured at warehouse receipt',
  })
  @IsNumber()
  @IsOptional()
  moistureContentPct?: number;

  @ApiPropertyOptional({
    example: 'Mbarali Central Cooperative Warehouse - Bay A',
  })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;

  @ApiProperty({
    example: '2027-05-25T11:00:00Z',
    description: 'Date received at the warehouse',
  })
  @IsDateString()
  receivedDate: string;

  @ApiPropertyOptional({ description: 'Collection centre the rice was brought to' })
  @IsString()
  @IsOptional()
  collectionCentreId?: string;

  @ApiPropertyOptional({
    example: 'SARO 5',
    description: 'Rice variety; defaults to the crop season variety',
  })
  @IsString()
  @IsOptional()
  riceVariety?: string;

  @ApiPropertyOptional({ example: 9, description: 'Number of bags delivered' })
  @IsInt()
  @Min(0)
  @IsOptional()
  bags?: number;

  @ApiPropertyOptional({ example: 1800, description: 'Purchase price per kg paid to the farmer (TZS)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerKg?: number;

  @ApiPropertyOptional({ example: 'BATCH-A-12', description: 'Storage batch (bay or stack) number' })
  @IsString()
  @IsOptional()
  batchNumber?: string;
}

/** Farmer self-reports a warehouse delivery against their own crop cycle. */
export class FarmerReportDeliveryDto {
  @IsString()
  @IsNotEmpty()
  cropCycleId: string;

  @IsNumber()
  @IsPositive()
  weightKg: number;

  @IsOptional()
  @IsString()
  qualityGrade?: string;

  @IsOptional()
  @IsNumber()
  moistureContentPct?: number;

  @IsOptional()
  @IsString()
  warehouseLocation?: string;

  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsOptional()
  @IsString()
  collectionCentreId?: string;

  @IsOptional()
  @IsString()
  riceVariety?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bags?: number;
}

/** Correct or complete a delivery after weighing and grading (price, variety, centre, batch...). */
export class UpdateInventoryRecordDto {
  @IsOptional() @IsNumber() @IsPositive() weightKg?: number;
  @IsOptional() @IsString() qualityGrade?: string;
  @IsOptional() @IsNumber() @Min(0) moistureContentPct?: number;
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsInt() @Min(0) bags?: number;
  @IsOptional() @IsNumber() @Min(0) pricePerKg?: number;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() warehouseLocation?: string;
  @IsOptional() @IsString() collectionCentreId?: string;
}

/** Money paid to the farmer for a delivery. */
export class RecordFarmerPaymentDto {
  @ApiProperty({ example: 500000, description: 'Amount paid now (TZS)' })
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CollectionCentreDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsString() @IsOptional() region?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() district?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() ward?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() village?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactPhone?: string;
  @ApiPropertyOptional({ description: 'Warehouse this centre normally delivers to' })
  @IsString()
  @IsOptional()
  warehouseId?: string;
  @ApiPropertyOptional({ description: 'Super admin only: cooperative that owns the centre' })
  @IsString()
  @IsOptional()
  mamcosId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateInventoryStatusDto {
  @ApiProperty({ example: 'IN_STORAGE', enum: InventoryStatus })
  @IsEnum(InventoryStatus)
  status: InventoryStatus;

  @ApiPropertyOptional({
    example: 'Mbarali Central Cooperative Warehouse - Bay B (Processed)',
  })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;
}

export class CreateLotDto {
  @ApiProperty({
    example: 'LOT-2027-TZ-001',
    description: 'Unique Fairtrade export lot identifier',
  })
  @IsString()
  @IsNotEmpty()
  lotNumber: string;

  @ApiProperty({
    example: 'SARO 5 (TXD 306)',
    description: 'Uniform rice variety across all batched bags',
  })
  @IsString()
  @IsNotEmpty()
  riceVariety: string;

  @ApiPropertyOptional({
    example: 'Grade 1',
    description:
      'Grade of the lot. Taken from the records when they are graded; required when they are not.',
  })
  @IsString()
  @IsOptional()
  grade?: string;

  @ApiProperty({
    example: ['inventory-record-uuid-1', 'inventory-record-uuid-2'],
    description: 'List of inventory record IDs to combine into this lot',
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  inventoryRecordIds: string[];
}
