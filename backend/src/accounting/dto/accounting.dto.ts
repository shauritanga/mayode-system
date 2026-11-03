import {
  IsArray,
  IsBoolean,
  Max,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
export class CreateInvoiceDto {
  /** Leave out to number it automatically (INV-2026-000001). */
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() saleId?: string;
  @IsOptional() @IsString() buyerId?: string;
  /** The amount before VAT. VAT is added when the cooperative is VAT-registered. */
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() description?: string;
  /** Income account code the sale is booked to (default 4000). */
  @IsOptional() @IsString() revenueAccountCode?: string;
  /** False for a zero-rated or exempt sale. */
  @IsOptional() @IsBoolean() vatApplies?: boolean;
  /** Percent of the amount the customer withholds as tax. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) withholdingPercent?: number;
}
export class CreateBillDto {
  /** Leave out to number it automatically (BILL-2026-000001). */
  @IsOptional() @IsString() billNumber?: string;
  @IsString() supplier: string;
  @IsOptional() @IsString() supplierId?: string;
  /** The amount before VAT. Input VAT is added when the cooperative is VAT-registered. */
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() description?: string;
  /** Account code the cost is booked to (default 5000). */
  @IsOptional() @IsString() expenseAccountCode?: string;
  @IsOptional() @IsBoolean() vatApplies?: boolean;
  /** Percent of the amount we hold back as withholding tax. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) withholdingPercent?: number;
}
export class BudgetLineDto {
  @IsString() accountId: string;
  @IsNumber() @Min(0) amount: number;
}
export class JournalEntryLineDto {
  @IsString() accountId: string;
  @IsOptional() @IsNumber() @Min(0) debit?: number;
  @IsOptional() @IsNumber() @Min(0) credit?: number;
  @IsOptional() @IsString() description?: string;
}
export class CreateJournalEntryDto {
  @IsDateString() entryDate: string;
  @IsString() @IsNotEmpty() description: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalEntryLineDto)
  lines: JournalEntryLineDto[];
}
export class CreateBudgetDto {
  @IsOptional() @IsString()
  mamcosId?: string;

  @IsString() name: string;
  @IsOptional() @IsNumber() fiscalYear?: number;
  @IsOptional() @IsString() seasonLabel?: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines: BudgetLineDto[];
}

export class CreateMemberContributionDto {
  @IsString() @IsNotEmpty()
  farmerId: string;

  @IsNumber() @Min(0.01)
  amount: number;

  @IsDateString()
  contributionDate: string;

  @IsOptional() @IsString()
  paymentMethod?: string;

  @IsOptional() @IsString()
  reference?: string;

  @IsOptional() @IsString()
  description?: string;
}

export class CreateReserveAllocationDto {
  @IsOptional() @IsString()
  mamcosId?: string;

  @IsNumber() @Min(0.01)
  amount: number;

  @IsDateString()
  allocationDate: string;

  @IsOptional() @IsString()
  description?: string;
}

export class ReverseJournalDto {
  @IsString() @IsNotEmpty() reason: string;
  /** Date of the reversal (YYYY-MM-DD); default today. */
  @IsOptional() @IsDateString() date?: string;
}
