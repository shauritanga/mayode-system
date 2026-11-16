import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SaveTermsDto {
  @IsBoolean() enabled: boolean;
  @IsIn(['MONTHLY', 'SEASON']) period: 'MONTHLY' | 'SEASON';
  @Type(() => Number) @IsInt() @Min(0) @Max(365) graceDays: number;
  @IsIn(['INTEREST_FIRST', 'PRINCIPAL_FIRST']) paymentOrder: 'INTEREST_FIRST' | 'PRINCIPAL_FIRST';
}
export class RateDto {
  @IsString() @MinLength(2) @MaxLength(80) label: string;
  /** Percent per period (per month, or per season). */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100) ratePercent: number;
  @IsDateString() validFrom: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsUUID() seasonId?: string;
}
