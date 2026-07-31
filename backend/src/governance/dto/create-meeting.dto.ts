import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsString, Min } from 'class-validator';

export class CreateMeetingDto {
  @IsDateString() meetingDate: string;
  @IsString() agenda: string;
  @IsString() decisions: string;
  @Type(() => Number) @IsInt() @Min(0) attendeeCount: number;
}
