import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { AlertCategory, AlertUrgency } from '@prisma/client';

export class CreateFarmAlertDto {
  @ApiProperty({ description: 'Farm the alert is about' })
  @IsUUID()
  farmId: string;

  @ApiProperty({ enum: AlertCategory })
  @IsEnum(AlertCategory)
  category: AlertCategory;

  @ApiPropertyOptional({ enum: AlertUrgency, default: AlertUrgency.MEDIUM })
  @IsOptional()
  @IsEnum(AlertUrgency)
  urgency?: AlertUrgency;

  @ApiProperty({ example: 'Fertilizer application is due' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'An important action may be required on this farm. Open to review the detected issue.',
    description: 'Shown to everyone (free preview) — no diagnosis.',
  })
  @IsString()
  @IsNotEmpty()
  previewMessage: string;

  @ApiPropertyOptional({ description: 'Premium: the diagnosis/recommendation' })
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional({ description: 'Premium: the specific action plan' })
  @IsOptional()
  @IsString()
  actionDetails?: string;

  @ApiPropertyOptional({ description: 'Premium: when the action should be taken' })
  @IsOptional()
  @IsDateString()
  expectedActionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  plotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cropCycleId?: string;
}
