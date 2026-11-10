import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Max, Min } from 'class-validator';

export class ProposeRateDto {
  @IsIn(['AMCOS', 'CANAL', 'BLOCK']) scope: 'AMCOS' | 'CANAL' | 'BLOCK';
  @IsOptional() @IsUUID() canalId?: string;
  @IsOptional() @IsUUID() blockId?: string;
  /** TZS per hectare. */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000) ratePerHectare: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DecideRateDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class OpenHarvestDto {
  @IsUUID() blockId: string;
  @IsUUID() seasonId: string;
  /** YYYY-MM-DD; optional due date shown on each farmer's charge. */
  @IsOptional() @IsString() dueDate?: string;
  /** Only work out what would be charged. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class ClearanceQueryDto {
  @IsOptional() @IsUUID() typeId?: string;
}

export class TenantQueryDto {
  @IsOptional() @IsString() @IsNotEmpty() mamcosId?: string;
}

export class UsePassDto {
  /** The code from the SMS. */
  @IsOptional() @IsString() @MaxLength(12) code?: string;
  /** Or: the block leader signs this plot off. */
  @IsOptional() @IsUUID() hectareId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() arrivalId?: string;
}

export class LookupPassDto { @IsString() @IsNotEmpty() @MaxLength(12) code: string; }
export class HoldPassDto { @IsString() @IsNotEmpty() @MaxLength(500) reason: string; }

export class LogArrivalDto {
  @IsUUID() blockId: string;
  @IsString() @IsNotEmpty() @MaxLength(100) operatorName: string;
  @IsOptional() @IsString() @MaxLength(30) operatorPhone?: string;
  @IsOptional() @IsString() @MaxLength(100) machine?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReportIncidentDto {
  @IsUUID() blockId: string;
  @IsOptional() @IsUUID() hectareId?: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) description: string;
}

export class ResolveIncidentDto { @IsString() @IsNotEmpty() @MaxLength(1000) resolution: string; }

export class SplitDto { @Type(() => Number) @IsInt() @Min(0) @Max(100) maintenancePercent: number; }

export class ReconcileDto {
  @IsString() @IsNotEmpty() day: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class GateQueryDto {
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() onSite?: string;
  @IsOptional() @IsString() day?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() mamcosId?: string;
}
