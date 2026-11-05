import { Type } from 'class-transformer';
import { BoardPosition } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AddBoardMemberDto {
  @IsUUID() farmerId: string;
  @IsOptional() @IsEnum(BoardPosition) position?: BoardPosition;
  @IsDateString() termStart: string;
  @IsOptional() @IsDateString() termEnd?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateBoardMemberDto {
  @IsOptional() @IsEnum(BoardPosition) position?: BoardPosition;
  @IsOptional() @IsDateString() termStart?: string;
  @IsOptional() @IsDateString() termEnd?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class EndBoardMemberDto {
  @IsString() @MaxLength(300) reason: string;
  @IsOptional() @IsDateString() endedOn?: string;
}

export class BoardQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
  @IsOptional() @IsUUID() mamcosId?: string;
}
