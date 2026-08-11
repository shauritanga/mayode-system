import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Gender, PremiumFundEntryType } from '@prisma/client';

export class DateRangeDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

// Filter set from the docx: region/district/ward/village/cooperative/officer/season/variety/gender/youth.
export class ReportFilterDto extends DateRangeDto {
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsString() mamcosId?: string;
  @IsOptional() @IsString() fieldOfficerId?: string;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  youthOnly?: boolean;
}

export class ReportFormatDto extends ReportFilterDto {
  @IsOptional() @IsEnum(['json', 'csv', 'xlsx', 'pdf'] as const) format?: 'json' | 'csv' | 'xlsx' | 'pdf';
}

export class CreatePremiumFundEntryDto {
  @IsEnum(PremiumFundEntryType) entryType: PremiumFundEntryType;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() description: string;
  @IsOptional() @IsDateString() entryDate?: string;
}
