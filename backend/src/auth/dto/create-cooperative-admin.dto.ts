import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

/** Super Admin registers the administrator of a cooperative. */
export class CreateCooperativeAdminDto {
  @ApiProperty({ description: 'The AMCOS this administrator will manage' })
  @IsUUID()
  mamcosId: string;

  @ApiProperty({ example: 'Amina' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Juma' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '+255768680433' })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Phone number must be valid (10-15 digits)' })
  phone: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'sw' })
  @IsString()
  @IsOptional()
  language?: string;
}
