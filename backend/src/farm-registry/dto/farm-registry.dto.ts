import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class PreRegisterFarmDto {
  @ApiPropertyOptional({
    example: 'AMCOS registry contact',
    description: 'Optional historical contact; AMCOS is the legal farm owner',
  })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({
    example: '+255712345678',
    description: 'Optional historical contact number',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'ownerPhone must be a valid phone number',
  })
  ownerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerNationalId?: string;

  @ApiPropertyOptional({ description: 'Responsible cooperative (AMCOS) ID' })
  @IsOptional()
  @IsUUID()
  sourceMamcosId?: string;

  @ApiPropertyOptional({ example: 'Plot No. 02, Block 5, Madibira AMCOS' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '02' })
  @IsOptional()
  @IsString()
  plotNumber?: string;

  @ApiPropertyOptional({ example: '5' })
  @IsOptional()
  @IsString()
  block?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  canal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheme?: string;

  @ApiPropertyOptional({ example: 'South-West' })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ward?: string;

  @ApiPropertyOptional({ example: 'Mbarali' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'Mbeya' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Farm size in hectares' })
  @IsOptional()
  @IsNumber()
  farmSizeHectares?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
