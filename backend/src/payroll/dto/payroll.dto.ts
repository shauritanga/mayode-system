import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { PayrollPayMethod } from '@prisma/client';

const money = { maxDecimalPlaces: 2 };
export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreatePayeeDto {
  @IsUUID() userId: string;
  @IsString() @IsNotEmpty() @MaxLength(80) title: string;
  @Type(() => Number) @IsNumber(money) @Min(0) monthlySalary: number;
  /** Defaults to today. */
  @IsOptional() @IsDateString() startDate?: string;
}

export class UpdatePayeeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) title?: string;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) monthlySalary?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateRunDto {
  @Matches(PERIOD, { message: 'period must be YYYY-MM' }) period: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class UpdateLineDto {
  /** Pay for the month when it differs from the salary (part month, bonus). */
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) gross?: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) deductions?: number;
  @IsOptional() @IsString() @MaxLength(200) deductionNote?: string;
}

export class PostRunDto {
  @IsEnum(PayrollPayMethod) payMethod: PayrollPayMethod;
  /** The money account the salaries were paid from; leave out for the default account of that kind. */
  @IsOptional() @IsString() cashAccountId?: string;
  /** Defaults to today; cannot be in the future. */
  @IsOptional() @IsDateString() paidOn?: string;
  /** Text each person their payslip summary. */
  @IsOptional() @IsBoolean() notify?: boolean;
}
