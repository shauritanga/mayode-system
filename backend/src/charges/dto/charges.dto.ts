import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateChargeDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) graceDays?: number;
}

export class MonthDto {
  /** The month the storage fee is for, e.g. 2026-11. */
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose the month like 2026-11' }) month: string;
}
