import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class RiceProtocolTaskDefinitionDto {
  @ApiProperty() @IsString() @IsNotEmpty() key: string;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() guidance: string;
  @ApiProperty({
    description:
      'Days from planting; harvest tasks may use daysFromHarvest instead.',
  })
  @IsOptional()
  @IsNumber()
  daysFromPlanting?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() daysFromHarvest?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() activityType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  requiredMeasurements?: Record<
    string,
    { label: string; unit?: string; min?: number; max?: number }
  >;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() evidenceRequired?: boolean;
}

export class UpdateRiceProtocolDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ type: [RiceProtocolTaskDefinitionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiceProtocolTaskDefinitionDto)
  taskDefinitions: RiceProtocolTaskDefinitionDto[];
}

export class CompleteRiceCalendarTaskDto {
  @ApiPropertyOptional({
    description: 'Values keyed by the protocol measurement keys.',
  })
  @IsOptional()
  @IsObject()
  measurements?: Record<string, string | number>;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class RescheduleRiceCalendarTaskDto {
  @ApiProperty({ description: 'New due date for this crop-cycle task.' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({
    description:
      'Optional reason, for example variety stage or field-officer/VBAA advice.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
