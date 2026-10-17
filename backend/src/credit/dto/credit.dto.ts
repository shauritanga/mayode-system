import { ApiPropertyOptional } from '@nestjs/swagger';
import { LoanPurpose } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class SubmitApplicationDto {
  @ApiPropertyOptional({ description: 'Staff applying for a farmer must give the farmer; farmers omit it.' })
  @IsOptional() @IsString() farmerId?: string;
  @IsString() lenderId: string;
  @IsNumber() @IsPositive() amountRequested: number;
  @IsInt() @Min(1) @Max(60) termMonths: number;
  @IsEnum(LoanPurpose) purpose: LoanPurpose;
  @IsOptional() @IsString() purposeNote?: string;
  @IsOptional() @IsString() cropCycleId?: string;
}

export class ApproveApplicationDto {
  @IsNumber() @IsPositive() approvedAmount: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) termMonths?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) interestRatePercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) autoDeductPercent?: number;
  @IsOptional() @IsString() note?: string;
}

export class RejectApplicationDto {
  @IsString() note: string;
}

export class DisburseApplicationDto {
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsDateString() disbursedAt?: string;
  @IsOptional() @IsString() reference?: string;
}
