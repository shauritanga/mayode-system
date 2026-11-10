import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

const money = { maxDecimalPlaces: 2 };

export class CreateCombineDto {
  @IsString() @MinLength(3) @MaxLength(30) registrationNumber: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsString() @MinLength(2) @MaxLength(120) ownerName: string;
  @IsOptional() @IsString() @MaxLength(30) ownerPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) operatorName?: string;
  @IsOptional() @IsString() @MaxLength(30) operatorPhone?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class UpdateCombineDto {
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(30) ownerPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) operatorName?: string;
  @IsOptional() @IsString() @MaxLength(30) operatorPhone?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class HarvestSettingDto {
  /** How many baskets of paddy make one bag. */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.1) @Max(1000) basketsPerBag: number;
  /** What a bag is worth, used to work out a hectare's income. Leave empty to track bags only. */
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) pricePerBag?: number;
}
export class CreateCollectionDto {
  /** The hectare, typed as shown (1:1R-1). */
  @IsString() @IsNotEmpty() farmId: string;
  @IsString() @IsNotEmpty() registrationNumber: string;
  @IsOptional() @IsDateString() harvestedOn?: string;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) quantityKg?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bags?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) baskets?: number;
  @Type(() => Number) @IsNumber(money) @Min(0) amount: number;
  /** False when the money has not been received yet: the payment then waits in the pending list. Default true. */
  @IsOptional() @IsBoolean() collected?: boolean;
  /** The canal or block leader who received the money. Defaults to the signed-in leader. */
  @IsOptional() @IsUUID() collectorFarmerId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class CollectDto {
  @IsOptional() @IsUUID() collectorFarmerId?: string;
}
export class VoidDto { @IsString() @MinLength(3) @MaxLength(300) reason: string; }
export class CollectionQueryDto {
  @IsOptional() @IsIn(['PENDING', 'COLLECTED', 'ALL']) status?: string;
  @IsOptional() @IsUUID() combineId?: string;
  @IsOptional() @IsUUID() hectareId?: string;
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() mamcosId?: string;
}
