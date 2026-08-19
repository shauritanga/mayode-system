import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMamcosDto {
  @ApiProperty({ example: 'Mbarali Farmers Cooperative' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Rujewa Ward' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({
    example: 5000.5,
    description: 'Total land area in hectares',
  })
  @IsNumber()
  @IsOptional()
  totalHectares?: number;

  @ApiPropertyOptional({ example: 'Ndugu John Pombe' })
  @IsString()
  @IsOptional()
  chairmanName?: string;

  @ApiPropertyOptional({ example: '+255768112233' })
  @IsString()
  @IsOptional()
  chairmanPhone?: string;
}

export class UpdateMamcosDto {
  @ApiPropertyOptional({ example: 'Madibira AMCOS' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Rujewa Ward' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: 5200.0 })
  @IsNumber()
  @IsOptional()
  totalHectares?: number;

  @ApiPropertyOptional({ example: 'Ndugu John Pombe' })
  @IsString()
  @IsOptional()
  chairmanName?: string;

  @ApiPropertyOptional({ example: '+255768112233' })
  @IsString()
  @IsOptional()
  chairmanPhone?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class AssignFarmerDto {
  @ApiProperty({
    example: 'farmer-uuid-1234',
    description: 'ID of the farmer to assign to this MAMCOS',
  })
  @IsString()
  @IsNotEmpty()
  farmerId: string;
}

export class CreateSecretaryDto {
  @ApiProperty({
    example: 'user-uuid-5678',
    description: 'User ID of the MAMCOS secretary',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Mdoe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;
}
