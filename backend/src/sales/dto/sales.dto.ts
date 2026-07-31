import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateSaleDto {
  @IsString() lotId: string;
  @IsString() buyerId: string;
  @IsNumber() @IsPositive() quantityKg: number;
  @IsNumber() @Min(0) pricePerKg: number;
  @IsOptional() @IsNumber() @Min(0) fairtradePremium?: number;
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsString() packaging?: string;
  @IsDateString() saleDate: string;
}

export class SettleSaleDto {
  @ApiPropertyOptional({ description: 'Confirmed buyer payment date; defaults to now.' })
  @IsOptional() @IsDateString() paymentDate?: string;
}

export class CollectBuyerPaymentDto {
  @IsOptional() @IsString()
  phoneNumber?: string;
}
