import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SupplierKind } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertSupplierDto {
  /** An individual or a company. Older clients that leave it out are treated as a company. */
  @ApiPropertyOptional({ enum: SupplierKind })
  @IsOptional()
  @IsEnum(SupplierKind)
  kind?: SupplierKind;

  /** The person's full name, or the company's name. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  /** For a company: the person to contact. */
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) tin?: string;
  /** National ID number (individual). */
  @IsOptional() @IsString() @MaxLength(40) idNumber?: string;
  /** Business registration number (company). */
  @IsOptional() @IsString() @MaxLength(60) businessRegNo?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemsSupplied?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Changing a supplier needs only the fields that change (switching it on or off sends just `isActive`). */
export class UpdateSupplierDto extends PartialType(UpsertSupplierDto) {}
