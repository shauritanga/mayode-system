import { ApiPropertyOptional } from '@nestjs/swagger';
import { InsuranceProductType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class SubmitInsuranceApplicationDto {
  @ApiPropertyOptional({ description: 'Staff applying for a farmer must give the farmer; farmers omit it.' })
  @IsOptional() @IsString() farmerId?: string;
  @IsString() providerId: string;
  @IsEnum(InsuranceProductType) productType: InsuranceProductType;
  @IsOptional() @IsString() farmId?: string;
  @IsOptional() @IsString() cropCycleId?: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsNumber() @IsPositive() insuredAreaHectares: number;
  @IsOptional() @IsNumber() @Min(0) requestedSumInsured?: number;
  @IsOptional() @IsString() notes?: string;
}

export class ApproveInsuranceApplicationDto {
  @IsNumber() @IsPositive() sumInsured: number;
  @IsNumber() @Min(0) premiumAmount: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() note?: string;
}

export class RejectInsuranceApplicationDto {
  @IsString() note: string;
}

export class RecordPremiumDto {
  @IsNumber() @IsPositive() amount: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
}
