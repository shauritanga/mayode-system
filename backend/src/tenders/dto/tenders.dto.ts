import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ContractorKind, ContractorStatus, TenderCategory } from '@prisma/client';

export class MilestonePlanDto {
  @IsString() @MinLength(3) @MaxLength(150) title: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) percent: number;
}

export class CreateTenderDto {
  @IsString() @MinLength(5) @MaxLength(200) title: string;
  @IsString() @MinLength(20) @MaxLength(8000) scope: string;
  @IsEnum(TenderCategory) category: TenderCategory;
  @IsOptional() @IsUUID() canalId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsUUID('all', { each: true }) blockIds?: string[];
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) budgetCeiling: number;
  @IsDateString() opensAt: string;
  @IsDateString() closesAt: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) requiredEquipment?: number;
  /** Evaluation weights; must add up to 100. Defaults: price 60, equipment 15, experience 10, past performance 15. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) wPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) wEquipment?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) wExperience?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) wPerformance?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => MilestonePlanDto) milestones: MilestonePlanDto[];
}

export class ReasonDto { @IsString() @MinLength(3) @MaxLength(1000) reason: string; }
export class NoteDto { @IsOptional() @IsString() @MaxLength(1000) note?: string; }

export class RecommendDto {
  @IsUUID() bidId: string;
  /** Required when the chosen bid is not the top-ranked one. */
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class RateDto { @Type(() => Number) @IsInt() @Min(1) @Max(5) rating: number; }

export class BidDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) price: number;
  @IsString() @MinLength(20) @MaxLength(8000) technicalProposal: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) equipmentOffered: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) completionDays: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) documentUrls?: string[];
}

export class SubmitMilestoneDto {
  @IsString() @MinLength(5) @MaxLength(2000) note: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) evidenceUrls?: string[];
}

export class SignOffDto {
  @IsString() @MinLength(5) @MaxLength(2000) note: string;
}

export class PayMilestoneDto {
  @IsIn(['MOBILE_MONEY', 'BANK', 'CASH']) method: 'MOBILE_MONEY' | 'BANK' | 'CASH';
  @IsString() @IsNotEmpty() @MaxLength(100) reference: string;
  @IsOptional() @IsUUID() cashAccountId?: string;
}

export class RegisterContractorDto {
  @IsEnum(ContractorKind) kind: ContractorKind;
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(100) contactPerson?: string;
  @IsString() @MinLength(9) @MaxLength(20) phone: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) tin?: string;
  @IsOptional() @IsString() @MaxLength(60) businessRegNo?: string;
  @IsOptional() @IsString() @MaxLength(40) memberNumber?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) equipment?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) equipmentCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(80) yearsExperience?: number;
  @IsOptional() @IsIn(['MOBILE_MONEY', 'BANK']) payoutMethod?: 'MOBILE_MONEY' | 'BANK';
  @IsOptional() @IsString() @MaxLength(60) payoutAccount?: string;
  @IsOptional() @IsString() @MaxLength(100) payoutName?: string;
}

export class UpdateContractorDto {
  @IsOptional() @IsString() @MaxLength(100) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) equipment?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) equipmentCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(80) yearsExperience?: number;
  @IsOptional() @IsIn(['MOBILE_MONEY', 'BANK']) payoutMethod?: 'MOBILE_MONEY' | 'BANK';
  @IsOptional() @IsString() @MaxLength(60) payoutAccount?: string;
  @IsOptional() @IsString() @MaxLength(100) payoutName?: string;
}

export class VetContractorDto {
  @IsEnum(ContractorStatus) status: ContractorStatus;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class TenderQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() mamcosId?: string;
}
