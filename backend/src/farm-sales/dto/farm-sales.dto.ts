import { FarmSaleFeePayer } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateFarmSaleDto {
  @IsUUID() hectareId: string;
  @Type(() => Number) @IsNumber() @Min(1) askingPrice: number;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  /** Who pays the listing fee: the seller now, or the buyer when they ask to buy. */
  @IsEnum(FarmSaleFeePayer) feePaidBy: FarmSaleFeePayer;
  /** Mobile-money number to charge when the seller pays now. Defaults to the account's phone. */
  @IsOptional() @IsString() @MaxLength(20) phoneNumber?: string;
}

export class PayFeeDto {
  @IsOptional() @IsString() @MaxLength(20) phoneNumber?: string;
}
