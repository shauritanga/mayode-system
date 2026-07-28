import { IsString, IsOptional, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryVisitsDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  farmerId?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive lower bound on visitedAt' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive upper bound on visitedAt' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageSize?: number;
}

export class CalendarQueryDto {
  @ApiPropertyOptional({ description: 'ISO date, inclusive lower bound; defaults to start of current month' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive upper bound; defaults to end of current month' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
