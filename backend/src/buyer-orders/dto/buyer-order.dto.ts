import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { BuyerOrderStatus } from '@prisma/client';

export class CreateBuyerOrderDto {
  @IsString() buyerId: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsNumber() @IsPositive() quantityRequiredKg: number;
  @IsOptional() @IsString() qualityRequirements?: string;
  @IsOptional() @IsString() qualityGrade?: string;
  @IsOptional() @IsNumber() @Min(0) offeredPricePerKg?: number;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsDateString() requiredByDate?: string;
  @IsOptional() @IsString() notes?: string;
}

/** Everything about an order except which buyer it is for. */
export class UpdateBuyerOrderDto {
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsNumber() @IsPositive() quantityRequiredKg?: number;
  @IsOptional() @IsString() qualityRequirements?: string;
  @IsOptional() @IsString() qualityGrade?: string;
  @IsOptional() @IsNumber() @Min(0) offeredPricePerKg?: number;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsDateString() requiredByDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateBuyerOrderStatusDto {
  @ApiPropertyOptional({ enum: BuyerOrderStatus })
  @IsEnum(BuyerOrderStatus)
  status: BuyerOrderStatus;
}
