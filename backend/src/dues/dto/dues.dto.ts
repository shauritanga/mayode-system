import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { DueBasis, DueCategory, DuePaymentMethod } from '@prisma/client';

const money = { maxDecimalPlaces: 2 };

export class CreateDueTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  /** Fertiliser is issued per farmer, not charged in bulk. */
  @IsEnum(DueCategory) category: DueCategory;
  @IsEnum(DueBasis) basis: DueBasis;
  @Type(() => Number) @IsNumber(money) @Min(0.01) rate: number;
  @IsOptional() @IsString() @MaxLength(60) season?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateDueTypeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0.01) rate?: number;
  @IsOptional() @IsString() @MaxLength(60) season?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ChargeDto {
  /** Overrides the charge's own due date. */
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CreateDueDto {
  @IsUUID() farmerId: string;
  @IsEnum(DueCategory) category: DueCategory;
  @IsString() @IsNotEmpty() @MaxLength(200) description: string;
  @Type(() => Number) @IsNumber(money) @Min(0.01) amount: number;
  @IsOptional() @IsDateString() dueDate?: string;
  /** Link to a defined charge so the same farmer is not charged twice for it. */
  @IsOptional() @IsUUID() typeId?: string;
}

export class IssueFertiliserDto {
  @IsUUID() farmerId: string;
  @IsString() @IsNotEmpty() @MaxLength(120) itemName: string;
  @Type(() => Number) @IsNumber(money) @Min(0.01) quantity: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @Type(() => Number) @IsNumber(money) @Min(0.01) unitPrice: number;
  @IsDateString() issuedOn: string;
  @IsOptional() @IsDateString() dueDate?: string;
  /** Book the sale on credit (Dr Fertiliser loans receivable / Cr Fertiliser sales). */
  @IsOptional() @IsBoolean() postToLedger?: boolean;
}

export class RecordPaymentDto {
  @Type(() => Number) @IsNumber(money) @Min(0.01) amount: number;
  @IsOptional() @IsDateString() paidOn?: string;
  @IsEnum(DuePaymentMethod) method: DuePaymentMethod;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
}

export class WaiveDto extends ReasonDto {
  /** Leave out to waive the whole remaining balance. */
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0.01) amount?: number;
}

export class DueListQueryDto {
  @IsOptional() @IsString() mamcosId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(DueCategory) category?: DueCategory;
  @IsOptional() @IsIn(['OPEN', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED']) state?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() farmerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}
