import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateLoanDto {
  @IsString() farmerId: string;
  @IsString() lenderName: string;
  @IsNumber() @Min(0.01) originalAmount: number;
  @IsNumber() @Min(0) amountOwed: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) autoDeductPercent?: number;
  @IsOptional() @IsString() repaymentSchedule?: string;
  @IsOptional() @IsString() lenderPayoutPhone?: string;
  @IsOptional() @IsString() lenderPayoutName?: string;
}
