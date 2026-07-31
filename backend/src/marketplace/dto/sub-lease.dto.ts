import { IsBoolean, IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class RequestSubLeaseDto {
  @ApiProperty({ example: 'farmer-renter-uuid', description: 'ID of the current renter requesting the sub-lease' })
  @IsString()
  @IsNotEmpty()
  renterId: string;

  @ApiPropertyOptional({ example: 1900000, description: 'Asking price for the re-listed remainder of the season' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  newAskingPrice?: number;
}

export class ApproveSubLeaseDto {
  @ApiProperty({ example: 'farmer-owner-uuid', description: 'ID of the listing owner deciding the request' })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ example: true, description: 'Owner approves (true) or rejects (false) the sub-lease request' })
  @IsBoolean()
  approve: boolean;
}
