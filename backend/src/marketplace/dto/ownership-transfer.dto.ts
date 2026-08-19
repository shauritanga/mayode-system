import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({
    example: 'farmer-owner-uuid',
    description: 'ID of the current owner initiating the transfer',
  })
  @IsString()
  @IsNotEmpty()
  currentOwnerId: string;

  @ApiProperty({
    example: '0768680433',
    description: 'Phone number of the new owner',
  })
  @IsString()
  @IsNotEmpty()
  newOwnerPhone: string;

  @ApiPropertyOptional({
    example: 'Sold the farm mid-season',
    description: 'Reason for the transfer',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
