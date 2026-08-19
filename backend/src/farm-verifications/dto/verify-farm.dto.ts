import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyFarmDto {
  @ApiProperty({
    example: 'farm-uuid-1234',
    description: 'ID of the farm being verified',
  })
  @IsString()
  @IsNotEmpty()
  farmId: string;

  @ApiProperty({ example: 'Ndugu Michael Shamba (Left Border Owner)' })
  @IsString()
  @IsNotEmpty()
  neighborLeft: string;

  @ApiProperty({ example: 'Ndugu Fatima Kilimo (Right Border Owner)' })
  @IsString()
  @IsNotEmpty()
  neighborRight: string;

  @ApiProperty({
    example: true,
    description:
      'Whether the local MAMCOS leadership approved this boundary verification',
  })
  @IsBoolean()
  mamcosApprovalStatus: boolean;

  @ApiProperty({
    example: 'https://example.com/verification-proof.jpg',
    description: 'GPS timestamped photo of the farm boundary',
  })
  @IsString()
  @IsNotEmpty()
  photoProofUrl: string;

  @ApiPropertyOptional({
    example:
      'Verified physical boundary markers in presence of village chairman. No disputes found.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
