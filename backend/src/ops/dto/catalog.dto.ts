import { ProductCategory, CustomerType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertProductDto {
  @IsOptional() @IsString() code?: string;
  @IsString() name: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsEnum(ProductCategory) category: ProductCategory;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsNumber() @Min(0) packSizeKg?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxRatePercent?: number;
  @IsOptional() @IsNumber() @Min(0) reorderLevelKg?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertCustomerDto {
  @IsEnum(CustomerType) type: CustomerType;
  @IsString() name: string;
  @IsString() phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() businessRegNo?: string;
  @IsOptional() @IsString() tin?: string;
  @IsOptional() @IsString() vrn?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
