import { DeliveryMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSaleOrderDto {
  @IsString() buyerId: string;
  @IsString() warehouseId: string;
  @IsString() lotId: string;
  @IsNumber() @IsPositive() quantityKg: number;
  @IsNumber() @Min(0) pricePerKg: number;
  @IsOptional() @IsNumber() @Min(0) fairtradePremium?: number;
  @IsOptional() @IsString() riceVariety?: string;
  /** Must match the lot's grade when given; defaults to it. */
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() packaging?: string;
  /** The buyer has no vehicle: the warehouse keeper must arrange transport. */
  @IsOptional() @IsBoolean() needsTransport?: boolean;
  @IsOptional() @IsString() notes?: string;
  /** The buyer's standing order or purchase agreement this reservation delivers against. */
  @IsOptional() @IsString() buyerOrderId?: string;
  @IsOptional() @IsString() agreementId?: string;
}

export class CancelSaleOrderDto {
  @IsString() @MinLength(3) reason: string;
}

export class ApproveSaleOrderDto {
  /** CREDIT lets stock leave before payment (a due date in days); RELEASE is a one-off override for an unpaid release. */
  @IsIn(['CREDIT', 'RELEASE']) kind: 'CREDIT' | 'RELEASE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) creditTermDays?: number;
  @IsString() @MinLength(3) note: string;
}

/** One truck at the loading bay: the weighbridge reading, the vehicle, and how it travels. */
export class LoadTruckDto {
  /** Weighed loaded weight in kg. Defaults to what is still owed when omitted. */
  @IsOptional() @IsNumber() @IsPositive() weightKg?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bagCount?: number;
  @IsString() @MinLength(3) vehiclePlate: string;
  @IsString() @MinLength(2) driverName: string;
  @IsOptional() @IsString() driverPhone?: string;
  /** BUYER_PICKUP when the buyer's own truck collects; OWN_FLEET or HIRED when we deliver. */
  @IsOptional() @IsEnum(DeliveryMode) mode?: DeliveryMode;
  @IsOptional() @IsString() transporterName?: string;
  @IsOptional() @IsNumber() @Min(0) fee?: number;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() notes?: string;
}

export class LoadStatusDto {
  @IsIn(['IN_TRANSIT', 'DELIVERED']) status: 'IN_TRANSIT' | 'DELIVERED';
  @IsOptional() @IsString() receivedBy?: string;
  @IsOptional() @IsString() proofNote?: string;
}
