import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Max, Min } from 'class-validator';

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
