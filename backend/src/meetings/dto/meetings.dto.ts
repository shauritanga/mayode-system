import { Type } from 'class-transformer';
import { MeetingKind } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateMeetingDto {
  @IsEnum(MeetingKind) kind: MeetingKind;
  @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsString() @MinLength(3) @MaxLength(4000) agenda: string;
  @IsString() @MinLength(2) @MaxLength(200) venue: string;
  @IsDateString() scheduledAt: string;
  /** Share of invited people who must check in. Defaults: 51 for the board, 25 for a general meeting. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) quorumPercent?: number;
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000) agenda?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) venue?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class CancelMeetingDto { @IsString() @MinLength(3) @MaxLength(300) reason: string; }
export class AttendanceDto { @IsUUID() farmerId: string; }
export class CloseMeetingDto { @IsString() @MinLength(10) @MaxLength(20000) minutes: string; }

export class ResolutionDto {
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsString() @MinLength(3) @MaxLength(4000) text: string;
  @IsOptional() @IsIn(['PASSED', 'REJECTED']) outcome?: 'PASSED' | 'REJECTED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) votesFor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) votesAgainst?: number;
}

export class MeetingQueryDto {
  @IsOptional() @IsIn(['upcoming', 'past', 'all']) when?: 'upcoming' | 'past' | 'all';
  @IsOptional() @IsEnum(MeetingKind) kind?: MeetingKind;
  @IsOptional() @IsUUID() mamcosId?: string;
}
