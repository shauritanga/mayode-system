import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MaintenanceTarget } from '@prisma/client';

const money = { maxDecimalPlaces: 2 };

export class CloseDrawerDto {
  @IsOptional() @IsDateString() day?: string;
  /** The cash actually counted in the drawer. */
  @Type(() => Number) @IsNumber(money) @Min(0) countedCash: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class ReceiveDrawerDto { @IsOptional() @IsString() @MaxLength(500) note?: string; }
export class DrawerQueryDto {
  @IsOptional() @IsIn(['SUBMITTED', 'RECEIVED', 'ALL']) status?: string;
  @IsOptional() @IsDateString() day?: string;
  @IsOptional() @IsString() mamcosId?: string;
}

export class IssueInputDto {
  @IsUUID() farmerId: string;
  @IsUUID() itemId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity: number;
  /** Defaults to the input's price on the stock list. */
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) unitPrice?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class AcknowledgeDto { @IsString() @Length(6, 6) code: string; }
export class IssueQueryDto {
  @IsOptional() @IsIn(['PENDING', 'ACKNOWLEDGED', 'ALL']) status?: string;
  @IsOptional() @IsUUID() farmerId?: string;
  @IsOptional() @IsString() mamcosId?: string;
}

export class OrderLineDto {
  @IsString() @MinLength(2) @MaxLength(150) itemName: string;
  @IsOptional() @IsUUID() inputItemId?: string;
  @IsString() @IsNotEmpty() @MaxLength(20) unit: string;
  @Type(() => Number) @IsNumber(money) @Min(0.01) quantity: number;
  @Type(() => Number) @IsNumber(money) @Min(0) unitPrice: number;
}
export class CreateOrderDto {
  @IsUUID() supplierId: string;
  @IsOptional() @IsDateString() expectedOn?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderLineDto) lines: OrderLineDto[];
}
export class ReceiveLineDto { @IsUUID() lineId: string; @Type(() => Number) @IsNumber(money) @Min(0.01) quantity: number; }
export class ReceiveOrderDto {
  @IsOptional() @IsDateString() receivedOn?: string;
  @IsOptional() @IsString() @MaxLength(60) deliveryNote?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveLineDto) lines: ReceiveLineDto[];
}
export class ReasonDto { @IsString() @MinLength(3) @MaxLength(500) reason: string; }
export class OrderQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() mamcosId?: string;
}

export class CreateScheduleDto {
  @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsEnum(MaintenanceTarget) target: MaintenanceTarget;
  @IsOptional() @IsUUID() canalId?: string;
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) intervalDays: number;
  /** When the first job is due; defaults to today. */
  @IsOptional() @IsDateString() nextDueOn?: string;
}
export class DoneDto {
  @IsOptional() @IsDateString() doneOn?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) cost?: number;
}
export class UpdateScheduleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) intervalDays?: number;
  @IsOptional() @IsDateString() nextDueOn?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
