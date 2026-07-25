import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTractorDto {
  @ApiProperty({ example: 'owner-uuid-here', description: 'ID of the TractorOwner' })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ example: 'T 123 ABC', description: 'Tractor vehicle registration number' })
  @IsString()
  @IsNotEmpty()
  registrationNo: string;

  @ApiPropertyOptional({ example: 'John Deere 5075E', description: 'Tractor model' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ example: 75, description: 'Tractor horsepower' })
  @IsNumber()
  @IsOptional()
  horsePower?: number;

  @ApiPropertyOptional({ example: true, description: 'Current availability for service' })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 'Rujewa, Mbarali', description: 'Tractor current location' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 60000, description: 'Price per hectare for tilling/plowing in TZS' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerHectare?: number;
}
