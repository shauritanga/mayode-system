import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

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
  /** The money account the statement is for. When given, its name and kind are used. */
  @IsOptional() @IsString() cashAccountId?: string;
  /** Needed only when no money account is chosen. */
  @IsOptional() @IsString() accountLabel?: string;
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
  /** The money account it came from or went into. Takes precedence over the method. */
  @IsOptional() @IsString() cashAccountId?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsBoolean() includesVat?: boolean;
  /** Receipt photos or files already uploaded (their URLs). */
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) attachments?: string[];
}
/** What may be changed on a record without touching the books. */
export class UpdateCashTransactionDto {
  @IsOptional() @IsString() @MaxLength(120) party?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) attachments?: string[];
}
export class CorrectCashTransactionDto extends CreateCashTransactionDto {
  @IsString() @IsNotEmpty() reason: string;
}
export class RejectCashTransactionDto {
  @IsString() @IsNotEmpty() reason: string;
}
export class CashSettingsDto {
  /** Expenses of this amount or more need approval; null or 0 switches approval off. */
  @IsOptional() @IsNumber() @Min(0) approvalThreshold?: number | null;
}
export class VoidCashTransactionDto {
  @IsString() @IsNotEmpty() reason: string;
}

export class CreateCashAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsIn(['CASH', 'BANK', 'MOBILE_MONEY']) kind: 'CASH' | 'BANK' | 'MOBILE_MONEY';
  /** The bank or mobile network, e.g. CRDB or M-Pesa. */
  @IsOptional() @IsString() @MaxLength(80) provider?: string;
  @IsOptional() @IsString() @MaxLength(60) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /** Money already in the account today. Becomes the opening balance in the books. */
  @IsOptional() @IsNumber() @Min(0) openingBalance?: number;
  @IsOptional() @IsDateString() openingDate?: string;
}
export class UpdateCashAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(80) provider?: string;
  @IsOptional() @IsString() @MaxLength(60) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class CashTransferDto {
  /** Leave out for money that is not in an account yet. */
  @IsOptional() @IsString() fromAccountId?: string;
  @IsOptional() @IsString() toAccountId?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() date: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class PayDto {
  /** The money account the payment went through; leave out for the default account of that kind, or none. */
  @IsOptional() @IsString() cashAccountId?: string;
}

export class FarmerPayoutDto {
  @IsOptional() @IsString() farmerId?: string;
  /** For a seller who is not a registered farmer. */
  @IsOptional() @IsString() @MaxLength(120) sellerName?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() paidOn: string;
  @IsOptional() @IsIn(['CASH', 'BANK', 'MOBILE_MONEY']) method?: 'CASH' | 'BANK' | 'MOBILE_MONEY';
  /** The money account it was paid from; wins over the method. */
  @IsOptional() @IsString() cashAccountId?: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
