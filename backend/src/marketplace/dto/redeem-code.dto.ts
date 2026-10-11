import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RedeemCodeDto {
  @ApiProperty({
    example: 'K7M4-QP2X',
    description:
      'The private-deal code the farm owner gave you. Capitals, spaces and dashes do not matter.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;
}
