import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateStaffDto {
  @IsString() @IsNotEmpty() @MaxLength(80) firstName: string;
  @IsString() @IsNotEmpty() @MaxLength(80) lastName: string;
  @IsString() @Matches(/^\+?[0-9\s-]{9,15}$/, { message: 'Phone number must be valid (9-15 digits)' }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  /** Field officers default to the cooperative's "Field Officer" role; every other kind of staff needs a role. */
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsIn(['FIELD_OFFICER', 'GENERAL']) staffType?: 'FIELD_OFFICER' | 'GENERAL';
  @IsOptional() @IsString() @MaxLength(120) assignedArea?: string;
  @IsOptional() @IsIn(['sw', 'en']) language?: string;
}
