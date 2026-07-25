import { IsString, IsNotEmpty, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMarketPriceDto {
  @ApiProperty({ example: 'Paddy Grade A', description: 'Name of the agricultural commodity' })
  @IsString()
  @IsNotEmpty()
  commodity: string;

  @ApiProperty({ example: 1200, description: 'Price per kg in TZS' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'Mbarali Central Market', description: 'Market location where price was recorded' })
  @IsString()
  @IsOptional()
  market?: string;

  @ApiPropertyOptional({ example: 'Ministry of Agriculture Board', description: 'Source of pricing data' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({ example: '2026-12-01T10:00:00Z', description: 'Date and time when price was recorded' })
  @IsDateString()
  recordedAt: string;
}
