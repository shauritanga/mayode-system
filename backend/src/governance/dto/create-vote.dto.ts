import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateVoteDto {
  @IsString() title: string;
  @IsString() @IsOptional() description?: string;
  @IsDateString() opensAt: string;
  @IsDateString() closesAt: string;
  @IsUUID() @IsOptional() meetingId?: string;
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  @Type(() => String)
  options: string[];
}
