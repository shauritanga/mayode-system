import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { ActivityFeeStatus, EquipmentOwnership, EquipmentType, MachineryActivityStatus, MachineryActivityType } from '@prisma/client';

export class CreateEquipmentDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  /** The machine type chosen from the AMCOS's own list in Settings. */
  @IsOptional() @IsUUID() typeId?: string;
  /** Older clients may send one of the standard kinds instead; it is matched to (or added to) the AMCOS's list. */
  @IsOptional() @IsEnum(EquipmentType) type?: EquipmentType;
  @IsOptional() @IsString() @MaxLength(60) registrationNo?: string;
  @IsEnum(EquipmentOwnership) ownership: EquipmentOwnership;
  /** Required when the machine belongs to someone else. */
  @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(30) ownerPhone?: string;
  /** This tool's own contribution per hectare; leave out to use the AMCOS's default rate. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) feePerHectare?: number;
  /** One-off registration fee for a tool owned by someone else; leave out to use the AMCOS's default. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) registrationFee?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateRatesDto {
  /** What a tool owned by someone else pays once to be registered. Send null to clear. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) toolRegistrationFee?: number | null;
  /** What any tool contributes per hectare it works. Send null to clear. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) toolFeePerHectare?: number | null;
}

export class UpdateEquipmentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(EquipmentType) type?: EquipmentType;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsString() @MaxLength(60) registrationNo?: string;
  @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(30) ownerPhone?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) feePerHectare?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateActivityDto {
  @IsDateString() activityDate: string;
  @IsEnum(MachineryActivityType) type: MachineryActivityType;
  @IsUUID() equipmentId: string;
  @IsOptional() @IsString() @MaxLength(120) operatorName?: string;
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100000) hectares: number;
  /** Only for external equipment; leave out to use hectares × the equipment's fee per hectare. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) feeAmount?: number;
  @IsOptional() @IsEnum(MachineryActivityStatus) status?: MachineryActivityStatus;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsDateString() activityDate?: string;
  @IsOptional() @IsEnum(MachineryActivityType) type?: MachineryActivityType;
  @IsOptional() @IsUUID() equipmentId?: string;
  @IsOptional() @IsString() @MaxLength(120) operatorName?: string;
  @IsOptional() @IsUUID() blockId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100000) hectares?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) feeAmount?: number;
  @IsOptional() @IsEnum(MachineryActivityStatus) status?: MachineryActivityStatus;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class MarkFeePaidDto {
  @IsOptional() @IsDateString() paidOn?: string;
}

export class ListQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(MachineryActivityType) type?: MachineryActivityType;
  @IsOptional() @IsUUID() equipmentId?: string;
  @IsOptional() @IsEnum(EquipmentOwnership) ownership?: EquipmentOwnership;
  @IsOptional() @IsEnum(MachineryActivityStatus) status?: MachineryActivityStatus;
  @IsOptional() @IsEnum(ActivityFeeStatus) feeStatus?: ActivityFeeStatus;
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() mamcosId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class CreateEquipmentTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
}

export class UpdateEquipmentTypeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
