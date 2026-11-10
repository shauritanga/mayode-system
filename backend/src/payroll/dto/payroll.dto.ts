import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ComplianceKind, CostCenter, PayrollPayMethod, PayrollTier, WageType } from '@prisma/client';

const money = { maxDecimalPlaces: 2 };
export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateTitleDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEnum(PayrollTier) tier: PayrollTier;
  @IsEnum(CostCenter) costCenter: CostCenter;
  @IsEnum(WageType) wageType: WageType;
  @IsOptional() @IsEnum(ComplianceKind) compliance?: ComplianceKind;
}

export class UpdateTitleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsEnum(PayrollTier) tier?: PayrollTier;
  @IsOptional() @IsEnum(CostCenter) costCenter?: CostCenter;
  @IsOptional() @IsEnum(WageType) wageType?: WageType;
  @IsOptional() @IsEnum(ComplianceKind) compliance?: ComplianceKind;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Someone with a login (give userId), or a support worker without one (give name, phone and an ID number). */
export class CreatePayeeDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) fullName?: string;
  @IsOptional() @IsString() @MinLength(9) @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) idType?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(60) idNumber?: string;
  /** A title from the AMCOS's list; or give `title` with tier, cost center and wage type. */
  @IsOptional() @IsUUID() titleId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) title?: string;
  @IsOptional() @IsEnum(PayrollTier) tier?: PayrollTier;
  @IsOptional() @IsEnum(CostCenter) costCenter?: CostCenter;
  @IsOptional() @IsEnum(WageType) wageType?: WageType;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) monthlySalary?: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) rate?: number;
  @IsOptional() @IsString() @MaxLength(30) pieceUnit?: string;
  @IsOptional() @IsIn(['MOBILE_MONEY', 'BANK']) payoutMethod?: 'MOBILE_MONEY' | 'BANK';
  @IsOptional() @IsString() @MaxLength(60) payoutAccount?: string;
  @IsOptional() @IsString() @MaxLength(100) payoutName?: string;
  /** Defaults to today. */
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() contractEnd?: string;
}

export class UpdatePayeeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) title?: string;
  @IsOptional() @IsUUID() titleId?: string;
  @IsOptional() @IsEnum(WageType) wageType?: WageType;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) monthlySalary?: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) rate?: number;
  @IsOptional() @IsString() @MaxLength(30) pieceUnit?: string;
  @IsOptional() @IsIn(['MOBILE_MONEY', 'BANK']) payoutMethod?: 'MOBILE_MONEY' | 'BANK';
  @IsOptional() @IsString() @MaxLength(60) payoutAccount?: string;
  @IsOptional() @IsString() @MaxLength(100) payoutName?: string;
  @IsOptional() @IsDateString() contractEnd?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AttendanceDto {
  @IsUUID() payeeId: string;
  @IsDateString() date: string;
  /** 1 = a whole day, 0.5 = half a day. */
  @IsOptional() @Type(() => Number) @IsIn([0.5, 1]) fraction?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class AttendanceDayDto {
  @IsDateString() date: string;
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) payeeIds: string[];
}

export class OutputDto {
  @IsUUID() payeeId: string;
  @IsDateString() date: string;
  @Type(() => Number) @IsNumber(money) @Min(0.01) quantity: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class BudgetDto { @Type(() => Number) @IsNumber(money) @Min(0) monthlyLimit: number; }

export class CreateRunDto {
  @Matches(PERIOD, { message: 'period must be YYYY-MM' }) period: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class UpdateLineDto {
  /** Pay for the month when it differs from what was worked out (part month, bonus). */
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) gross?: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) deductions?: number;
  @IsOptional() @IsString() @MaxLength(200) deductionNote?: string;
}

export class SubmitRunDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }

export class ApproveRunDto {
  @IsEnum(PayrollPayMethod) payMethod: PayrollPayMethod;
  /** The money account the salaries will be paid from; its balance must cover the run. */
  @IsOptional() @IsString() cashAccountId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ReturnRunDto { @IsString() @MinLength(3) @MaxLength(300) reason: string; }

export class PostRunDto {
  /** Defaults to today; cannot be in the future. */
  @IsOptional() @IsDateString() paidOn?: string;
  /** Text each person their payslip summary. */
  @IsOptional() @IsBoolean() notify?: boolean;
}
