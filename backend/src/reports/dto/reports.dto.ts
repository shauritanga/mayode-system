import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PremiumFundEntryType } from '@prisma/client';

export class DateRangeDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ReportFormatDto extends DateRangeDto {
  @IsOptional() @IsEnum(['json', 'csv', 'xlsx'] as const) format?: 'json' | 'csv' | 'xlsx';
}

export class CreatePremiumFundEntryDto {
  @IsEnum(PremiumFundEntryType) entryType: PremiumFundEntryType;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() description: string;
  @IsOptional() @IsDateString() entryDate?: string;
}
