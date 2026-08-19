import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LogImprovementDto {
  @ApiProperty({ example: 'farmer-renter-uuid' })
  @IsString()
  @IsNotEmpty()
  renterId: string;

  @ApiProperty({ example: 'Removed anthills and leveled 1.5 hectares' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    example: 300000,
    description:
      'Amount spent in TZS, deducted from the next annual installment',
  })
  @IsNumber()
  @Min(0)
  amountTzs: number;
}
