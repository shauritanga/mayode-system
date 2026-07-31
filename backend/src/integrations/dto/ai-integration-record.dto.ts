import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAiIntegrationRecordDto {
  @IsString()
  @ApiProperty({
    example: 'SOIL_TESTER',
    description:
      'Source system/type, e.g. SOIL_TESTER, DRONE_REPORT, RICE_SORTER, QR_TRACEABILITY, LOGISTICS_OPTIMIZER',
  })
  sourceType: string;

  @IsString()
  @IsOptional()
  farmId?: string;

  @IsString()
  @IsOptional()
  cropCycleId?: string;

  @IsString()
  @IsOptional()
  lotId?: string;

  @IsString()
  @IsOptional()
  externalReference?: string;

  @IsObject()
  @ApiProperty({ type: Object })
  payload: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  recommendation?: Record<string, unknown>;

  @IsDateString()
  @IsOptional()
  capturedAt?: string;
}
