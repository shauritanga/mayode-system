import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsPositive,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { InsuranceProductType, PolicyStatus } from '@prisma/client';

export class UpsertInsuranceProviderDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateInsurancePolicyDto {
  @IsString()
  farmerId: string;

  @IsOptional()
  @IsString()
  farmId?: string;

  @IsOptional()
  @IsString()
  cropCycleId?: string;

  @IsString()
  providerId: string;

  @IsEnum(InsuranceProductType)
  productType: InsuranceProductType;

  @IsOptional()
  @IsString()
  riceVariety?: string;

  @IsNumber()
  @Min(0.01)
  insuredAreaHectares: number;

  @IsNumber()
  @Min(0)
  sumInsured: number;

  @IsNumber()
  @Min(0)
  premiumAmount: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdatePolicyStatusDto {
  @IsEnum(PolicyStatus)
  status: PolicyStatus;
}

export class AmendPolicyDto {
  @IsOptional()
  @IsString()
  riceVariety?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  insuredAreaHectares?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sumInsured?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  premiumAmount?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class RenewPolicyDto {
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sumInsured?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  premiumAmount?: number;
}

export class CreateInsuranceClaimDto {
  @IsString()
  policyId: string;

  @IsDateString()
  incidentDate: string;

  @IsString()
  incidentType: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  claimedAmount: number;
}

export class InspectClaimDto {
  @IsOptional()
  @IsString()
  inspectionNotes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Photo URLs from the uploads service' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  assessedLossAmount?: number;

  @ApiPropertyOptional({ enum: ['APPROVE', 'REJECT', 'REINSPECT'] })
  @IsOptional()
  @IsIn(['APPROVE', 'REJECT', 'REINSPECT'])
  recommendation?: string;
}

export class ClaimDecisionDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ClaimPaymentDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}
