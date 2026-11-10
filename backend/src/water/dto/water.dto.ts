import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateScheduleDto {
  @IsUUID() canalId: string;
  @IsOptional() @IsUUID() blockId?: string;
  /** 0 = Sunday … 6 = Saturday. */
  @IsArray() @ArrayMaxSize(7) @Type(() => Number) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays: number[];
  @IsOptional() @IsDateString() startsOn?: string;
  @IsOptional() @IsDateString() endsOn?: string;
  @IsOptional() @IsUUID() gateOpenerPayeeId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class UpdateScheduleDto {
  @IsOptional() @IsArray() @ArrayMaxSize(7) @Type(() => Number) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays?: number[];
  @IsOptional() @IsDateString() endsOn?: string;
  @IsOptional() @IsUUID() gateOpenerPayeeId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateWaterLogDto {
  @IsUUID() canalId: string;
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsDateString() openedAt?: string;
  @IsOptional() @IsDateString() closedAt?: string;
  @IsOptional() @IsUUID() gateOpenerPayeeId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** LEAK, SHORTAGE, DISPUTE, BLOCKAGE or OTHER. */
  @IsOptional() @IsString() issueType?: string;
  @IsOptional() @IsString() @MaxLength(1000) issueNote?: string;
}

export class ResolveIssueDto { @IsString() @MinLength(3) @MaxLength(1000) resolution: string; }
