import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
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
export class CreateBudgetDto {
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
