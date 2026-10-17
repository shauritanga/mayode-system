import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { BuyerBusinessType } from '@prisma/client';

export class UpsertBuyerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  fairtradeCertNumber?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCertified?: boolean;

  @ApiPropertyOptional({ enum: BuyerBusinessType })
  @IsOptional()
  @IsEnum(BuyerBusinessType)
  businessType?: BuyerBusinessType;

  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsString() notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredVarieties?: string[];
}
