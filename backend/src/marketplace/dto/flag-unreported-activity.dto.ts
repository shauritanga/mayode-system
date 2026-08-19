import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FlagUnreportedActivityDto {
  @ApiProperty({
    example: 'user-uuid',
    description: "The field officer's User ID",
  })
  @IsString()
  @IsNotEmpty()
  officerUserId: string;

  @ApiProperty({
    example:
      'Observed active rice cultivation on this plot during a routine visit, but it shows no active M-LAX listing.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}
