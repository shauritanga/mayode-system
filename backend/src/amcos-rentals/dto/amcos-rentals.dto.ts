import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class WitnessNoteDto {
  /** The cooperative's own note on the arrangement: what it saw, confirmed or was told. */
  @IsString() @IsNotEmpty() @MaxLength(2000) note: string;
}

export class RaiseRentalDisputeDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
  /** Who raised it: the owner, the tenant, or the cooperative itself. */
  @IsOptional() @IsIn(['OWNER', 'TENANT', 'AMCOS']) raisedBy?: 'OWNER' | 'TENANT' | 'AMCOS';
}
