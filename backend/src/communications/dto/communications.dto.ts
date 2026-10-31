import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CommunicationAudience, CommunicationChannel } from '@prisma/client';

export class AudienceDto {
  @IsEnum(CommunicationAudience) audience: CommunicationAudience;
  /** Required when audience is SELECTED. One id is an individual message. */
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @IsUUID('all', { each: true }) farmerIds?: string[];
  @IsEnum(CommunicationChannel) channel: CommunicationChannel;
}

export class SendCommunicationDto extends AudienceDto {
  /** Required for email. */
  @IsOptional() @IsString() @MaxLength(150) subject?: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) body: string;
}

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() mamcosId?: string;
}
