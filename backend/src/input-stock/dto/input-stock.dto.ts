import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ADJUST_REASONS, RECEIVE_SOURCES } from '../input-stock.service';

export class ReceiveInputDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity: number;
  @IsIn([...RECEIVE_SOURCES]) source: string;
  @IsOptional() @IsString() @MaxLength(120) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost?: number | null;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class AdjustInputDto {
  @IsUUID() itemId: string;
  @IsUUID() warehouseId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) quantity: number;
  @IsIn([...ADJUST_REASONS]) reason: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class TransferInputDto {
  @IsUUID() itemId: string;
  @IsUUID() fromWarehouseId: string;
  @IsUUID() toWarehouseId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class ReverseInputDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
}
