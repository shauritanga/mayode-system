import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTractorOwnerDto {
  @ApiProperty({ example: 'Mbarali Agromech Ltd', description: 'Name of the tractor owner or company' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+255755999888', description: 'Contact phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'Rujewa, Mbarali', description: 'Base operating location' })
  @IsString()
  @IsOptional()
  location?: string;
}
