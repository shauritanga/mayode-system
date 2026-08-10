import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ClaimStatus,
  InsuranceProductType,
  PolicyStatus,
} from '@prisma/client';

export class UpsertInsuranceProviderDto {
  @IsString()
  name: string;

  @IsOptional() @IsString()
  contactPerson?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;
}

export class CreateInsurancePolicyDto {
  @IsString()
  farmerId: string;

  @IsOptional() @IsString()
  farmId?: string;

  @IsOptional() @IsString()
  cropCycleId?: string;

  @IsString()
  providerId: string;

  @IsEnum(InsuranceProductType)
  productType: InsuranceProductType;

  @IsOptional() @IsString()
  riceVariety?: string;

  @IsNumber() @Min(0.01)
  insuredAreaHectares: number;

  @IsNumber() @Min(0)
  sumInsured: number;

  @IsNumber() @Min(0)
  premiumAmount: number;

  @IsOptional() @IsDateString()
  startDate?: string;

  @IsOptional() @IsDateString()
  endDate?: string;
}

export class UpdatePolicyStatusDto {
  @IsEnum(PolicyStatus)
  status: PolicyStatus;
}

export class CreateInsuranceClaimDto {
  @IsString()
  policyId: string;

  @IsDateString()
  incidentDate: string;

  @IsString()
  incidentType: string;

  @IsOptional() @IsString()
  description?: string;

  @IsNumber() @Min(0)
  claimedAmount: number;
}

export class InspectClaimDto {
  @IsOptional() @IsString()
  inspectionNotes?: string;

  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional() @IsEnum(ClaimStatus)
  status?: ClaimStatus;
}

export class UpdateClaimPaymentDto {
  @IsEnum(ClaimStatus)
  status: ClaimStatus;

  @IsOptional() @IsNumber() @Min(0)
  paidAmount?: number;
}
