import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { BuyerOrderStatus } from '@prisma/client';

export class CreateBuyerOrderDto {
  @IsString() buyerId: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsNumber() @IsPositive() quantityRequiredKg: number;
  @IsOptional() @IsString() qualityRequirements?: string;
  @IsOptional() @IsDateString() requiredByDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateBuyerOrderStatusDto {
  @ApiPropertyOptional({ enum: BuyerOrderStatus })
  @IsEnum(BuyerOrderStatus)
  status: BuyerOrderStatus;
}
