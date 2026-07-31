import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueInputCreditDto {
  @ApiProperty({ example: 300000, description: 'Input credit amount in TZS (seeds/fertilizer)' })
  @IsNumber()
  @Min(0)
  amountTzs: number;

  @ApiPropertyOptional({ example: 'Deduct at harvest' })
  @IsString()
  @IsOptional()
  repaymentSchedule?: string;

  @ApiPropertyOptional({ example: 20, description: 'Percent of harvest sale auto-deducted to repay this loan' })
  @IsNumber()
  @IsOptional()
  autoDeductPercent?: number;
}
