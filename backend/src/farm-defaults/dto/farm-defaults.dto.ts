import { Type } from 'class-transformer';
import { DuePaymentMethod } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CaseQueryDto {
  /** open (under AMCOS) | notice | mlax | resolved | all */
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
  @IsOptional() @IsUUID() mamcosId?: string;
}

export class TakeOverDto {
  @IsUUID() payerFarmerId: string;
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) farmIds: string[];
  @IsEnum(DuePaymentMethod) method: DuePaymentMethod;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @IsString() cashAccountId?: string;
}

export class ReleaseDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
}
