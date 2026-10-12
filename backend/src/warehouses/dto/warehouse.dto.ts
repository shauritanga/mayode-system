import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() @IsPositive() capacityKg?: number;
  /** Super Admin only: leave empty for a platform warehouse. Cooperative admins always create in their own AMCOS. */
  @IsOptional() @IsString() mamcosId?: string;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() @IsPositive() capacityKg?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignKeeperDto {
  @IsString() userId: string;
}

/** Receive harvest into a warehouse: either existing inventory records, or a counted quantity. */
export class ReceiveStockDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inventoryRecordIds?: string[];
  @IsOptional() @IsNumber() @IsPositive() quantityKg?: number;
  @IsOptional() @IsString() note?: string;
}

export class AdjustStockDto {
  /** Positive adds stock, negative removes (spoilage, shrinkage, recount). */
  @IsNumber() deltaKg: number;
  @IsString() @MinLength(3) reason: string;
}

/** Turn stock that was counted in (not received from recorded deliveries) into a lot that can be sold. */
export class MakeLotDto {
  @IsString() @MinLength(3) lotNumber: string;
  @IsOptional() @IsString() riceVariety?: string;
  /** Required: a lot holds one grade. */
  @IsString() @MinLength(1) grade: string;
  @IsNumber() @IsPositive() quantityKg: number;
}
