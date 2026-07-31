import { IsString, IsNotEmpty, IsNumber, Min, IsIn, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitOfferDto {
  @ApiProperty({ example: 'farmer-uuid' })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiProperty({ example: 1800000, description: 'Bid amount in TZS, below the asking price' })
  @IsNumber()
  @Min(0)
  offerAmount: number;
}

export class RespondToOfferDto {
  @ApiProperty({ example: 'farmer-owner-uuid' })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ example: 'accept', enum: ['accept', 'reject', 'counter'] })
  @IsIn(['accept', 'reject', 'counter'])
  action: 'accept' | 'reject' | 'counter';

  @ApiPropertyOptional({ example: 1900000 })
  @IsNumber()
  @IsOptional()
  counterAmount?: number;
}

export class RespondToCounterDto {
  @ApiProperty({ example: 'farmer-uuid' })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  accept: boolean;
}
