import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayInstallmentDto {
  @ApiProperty({ example: 'farmer-renter-uuid', description: 'ID of the current renter paying the next year\'s rent' })
  @IsString()
  @IsNotEmpty()
  renterId: string;

  @ApiPropertyOptional({ example: '0768680433' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'MPESA-TX123' })
  @IsString()
  @IsOptional()
  mpesaRef?: string;
}
