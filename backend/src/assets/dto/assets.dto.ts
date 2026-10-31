import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  AssetCategory, AssetCondition, AssetDisposalMethod, AssetFundingSource, AssetMaintenanceKind, AssetStatus,
} from '@prisma/client';

const money = { maxDecimalPlaces: 2 };

export class CreateAssetDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsEnum(AssetCategory) category: AssetCategory;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(80) serialNo?: string;
  @IsDateString() purchaseDate: string;
  @Type(() => Number) @IsNumber(money) @Min(0) cost: number;
  @IsOptional() @IsEnum(AssetFundingSource) fundingSource?: AssetFundingSource;
  @IsOptional() @IsString() @MaxLength(120) supplier?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  /** Defaults to the category's usual life. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) usefulLifeYears?: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) salvageValue?: number;
  /** Defaults to the purchase date. */
  @IsOptional() @IsDateString() depreciationStart?: string;
  @IsOptional() @IsString() @MaxLength(120) custodianName?: string;
  @IsOptional() @IsUUID() custodianUserId?: string;
  @IsOptional() @IsDateString() warrantyExpiresOn?: string;
  @IsOptional() @IsDateString() insuranceExpiresOn?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) serviceIntervalDays?: number;
  @IsOptional() @IsUUID() equipmentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  /** Book the purchase (Dr Property, plant and equipment / Cr Cash). Leave off for assets bought before the books started. */
  @IsOptional() @IsBoolean() postToLedger?: boolean;
}

export class UpdateAssetDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(80) serialNo?: string;
  @IsOptional() @IsString() @MaxLength(120) supplier?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsDateString() warrantyExpiresOn?: string;
  @IsOptional() @IsDateString() insuranceExpiresOn?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) serviceIntervalDays?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AssetListQueryDto {
  @IsOptional() @IsString() mamcosId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(AssetCategory) category?: AssetCategory;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() custodian?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class CreateMaintenanceDto {
  @IsEnum(AssetMaintenanceKind) kind: AssetMaintenanceKind;
  @IsDateString() doneOn: string;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) cost?: number;
  @IsOptional() @IsString() @MaxLength(120) performedBy?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsDateString() nextDueOn?: string;
  /** Book the cost (Dr Repairs and maintenance / Cr Cash). */
  @IsOptional() @IsBoolean() postToLedger?: boolean;
}

export class ReassignCustodyDto {
  @IsString() @IsNotEmpty() @MaxLength(120) toName: string;
  @IsOptional() @IsUUID() toUserId?: string;
  @IsOptional() @IsDateString() assignedOn?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DisposeAssetDto {
  @IsDateString() disposedOn: string;
  @IsEnum(AssetDisposalMethod) method: AssetDisposalMethod;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) proceeds?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Book the disposal (removes cost and accumulated depreciation, records proceeds and the gain or loss). */
  @IsOptional() @IsBoolean() postToLedger?: boolean;
}

export class DepreciationPeriodDto {
  @IsOptional() @IsString() mamcosId?: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Period must look like 2026-10' }) period: string;
}
