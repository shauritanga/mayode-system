import { IsString, IsOptional, IsNumber, IsEnum, IsArray, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';

export class CreateInventoryRecordDto {
  @ApiProperty({ example: 'farm-uuid-1234', description: 'ID of the verified farm' })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiProperty({ example: 'farmer-uuid-5678', description: 'ID of the farmer supplying the harvest' })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiProperty({ example: 450.5, description: 'Net weight of the received harvest in kilograms' })
  @IsNumber()
  weightKg: number;

  @ApiPropertyOptional({ example: 'Grade 1 Premium', description: 'Assessed quality grade of the rice' })
  @IsString()
  @IsOptional()
  qualityGrade?: string;

  @ApiPropertyOptional({ example: 'Mbarali Central Cooperative Warehouse - Bay A' })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;

  @ApiProperty({ example: '2027-05-25T11:00:00Z', description: 'Date received at the warehouse' })
  @IsDateString()
  receivedDate: string;
}

export class UpdateInventoryStatusDto {
  @ApiProperty({ example: 'IN_STORAGE', enum: InventoryStatus })
  @IsEnum(InventoryStatus)
  status: InventoryStatus;

  @ApiPropertyOptional({ example: 'Mbarali Central Cooperative Warehouse - Bay B (Processed)' })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;
}

export class CreateLotDto {
  @ApiProperty({ example: 'LOT-2027-TZ-001', description: 'Unique Fairtrade export lot identifier' })
  @IsString()
  @IsNotEmpty()
  lotNumber: string;

  @ApiProperty({ example: 'SARO 5 (TXD 306)', description: 'Uniform rice variety across all batched bags' })
  @IsString()
  @IsNotEmpty()
  riceVariety: string;

  @ApiProperty({ example: ['inventory-record-uuid-1', 'inventory-record-uuid-2'], description: 'List of inventory record IDs to combine into this lot' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  inventoryRecordIds: string[];
}
