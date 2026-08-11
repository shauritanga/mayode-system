import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpsertSupplierDto {
  @IsString()
  name: string;

  @IsOptional() @IsString()
  contactPerson?: string;

  @IsOptional() @IsString()
  contactPhone?: string;

  @IsOptional() @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  itemsSupplied?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
