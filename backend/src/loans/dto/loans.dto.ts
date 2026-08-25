import { IsBoolean, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateLoanDto {
  @IsString() farmerId: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsString() lenderName: string;
  @IsNumber() @Min(0.01) originalAmount: number;
  @IsNumber() @Min(0) amountOwed: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) autoDeductPercent?: number;
  @IsOptional() @IsString() repaymentSchedule?: string;
  @IsOptional() @IsString() lenderPayoutPhone?: string;
  @IsOptional() @IsString() lenderPayoutName?: string;
}

export class CreateLenderDto {
  @IsString() name: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() payoutPhone?: string;
  @IsOptional() @IsString() payoutName?: string;
  @IsOptional() @IsNumber() @Min(0) interestRatePercent?: number;
}

export class UpdateLenderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() payoutPhone?: string;
  @IsOptional() @IsString() payoutName?: string;
  @IsOptional() @IsNumber() @Min(0) interestRatePercent?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
