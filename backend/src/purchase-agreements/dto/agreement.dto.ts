import { ApiPropertyOptional } from '@nestjs/swagger';
import { AgreementStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateAgreementDto {
  @IsString() buyerId: string;
  @IsOptional() @IsString() buyerOrderId?: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsString() qualityTerms?: string;
  @IsNumber() @IsPositive() quantityKg: number;
  @IsNumber() @Min(0) pricePerKg: number;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() documentUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAgreementDto {
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsString() qualityTerms?: string;
  @IsOptional() @IsNumber() @IsPositive() quantityKg?: number;
  @IsOptional() @IsNumber() @Min(0) pricePerKg?: number;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() documentUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class AgreementStatusDto {
  @ApiPropertyOptional({ enum: AgreementStatus })
  @IsEnum(AgreementStatus)
  status: AgreementStatus;
}
