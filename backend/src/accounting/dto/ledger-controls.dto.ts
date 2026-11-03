import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CloseBooksDto {
  /** Last day of the month to close through (YYYY-MM-DD). */
  @IsDateString() through: string;
}
export class ReopenBooksDto {
  /** Earlier month end to reopen back to; leave out to reopen everything. */
  @IsOptional() @IsDateString() to?: string;
  @IsString() @IsNotEmpty() reason: string;
}
export class TaxSettingsDto {
  @IsOptional() @IsString() tin?: string;
  @IsOptional() @IsString() vrn?: string;
  @IsOptional() @IsBoolean() vatRegistered?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatRate?: number;
}
export class VatSettlementDto {
  @IsDateString() through: string;
  @IsDateString() paidOn: string;
  @IsOptional() @IsString() reference?: string;
}
export class WithholdingRemittanceDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() paidOn: string;
  @IsOptional() @IsString() reference?: string;
}
export class StatementLineDto {
  @IsDateString() date: string;
  @IsString() description: string;
  @IsOptional() @IsString() reference?: string;
  /** Money in positive, money out negative. */
  @IsNumber() amount: number;
}
export class CreateStatementDto {
  @IsString() @IsNotEmpty() accountLabel: string;
  @IsOptional() @IsIn(['BANK', 'MOBILE_MONEY', 'CASH']) kind?: 'BANK' | 'MOBILE_MONEY' | 'CASH';
  @IsDateString() periodStart: string;
  @IsDateString() periodEnd: string;
  @IsNumber() openingBalance: number;
  @IsNumber() closingBalance: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => StatementLineDto)
  lines: StatementLineDto[];
}
export class MatchLineDto {
  @IsString() @IsNotEmpty() ledgerEntryId: string;
}
export class AdjustLineDto {
  @IsString() @IsNotEmpty() accountId: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateCashTransactionDto {
  @IsIn(['EXPENSE', 'INCOME']) kind: 'EXPENSE' | 'INCOME';
  @IsDateString() date: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() @IsNotEmpty() accountCode: string;
  @IsOptional() @IsString() party?: string;
  @IsOptional() @IsIn(['CASH', 'BANK', 'MOBILE_MONEY']) method?: 'CASH' | 'BANK' | 'MOBILE_MONEY';
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsBoolean() includesVat?: boolean;
}
export class VoidCashTransactionDto {
  @IsString() @IsNotEmpty() reason: string;
}
