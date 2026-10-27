import {
  IsArray,
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
  @IsString() invoiceNumber: string;
  @IsOptional() @IsString() saleId?: string;
  @IsOptional() @IsString() buyerId?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() dueDate: string;
}
export class CreateBillDto {
  @IsString() billNumber: string;
  @IsString() supplier: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() description?: string;
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
