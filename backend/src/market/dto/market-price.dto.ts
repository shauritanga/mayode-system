import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordPriceDto {
  @IsString() @IsNotEmpty() commodity: string;
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsString() market?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsDateString() recordedAt?: string;
}
