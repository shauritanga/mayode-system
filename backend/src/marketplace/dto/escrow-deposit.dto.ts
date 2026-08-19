import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EscrowDepositDto {
  @ApiProperty({
    example: 'farmer-renter-uuid',
    description: 'ID of the Farmer depositing funds to rent the land',
  })
  @IsString()
  @IsNotEmpty()
  renterId: string;

  @ApiProperty({
    example: 500000,
    description: 'Amount deposited into escrow in TZS',
  })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    example: 'MPESA-TX987654321',
    description:
      'M-Pesa transaction reference number (manual/fallback path only)',
  })
  @IsString()
  @IsOptional()
  mpesaRef?: string;

  @ApiPropertyOptional({
    example: '0768680433',
    description: 'Mobile-money phone number to push the USSD/PIN prompt to',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}
