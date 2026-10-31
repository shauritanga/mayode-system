import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';
import {
  IrrigationBlockSide, IrrigationDocumentType, IrrigationLeadershipPosition, IrrigationStatus,
} from '@prisma/client';

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() q?: string;
}

export class CreateSchemeDto {
  @IsString() @IsNotEmpty() @MaxLength(32) @Matches(CODE, { message: 'Scheme code may use letters, digits, ".", "_" and "-"' }) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  /** Super Admin chooses the AMCOS; everyone else is pinned to their own. */
  @IsOptional() @IsUUID() mamcosId?: string;
  @IsString() @IsNotEmpty() region: string;
  @IsString() @IsNotEmpty() district: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() village?: string;
  @IsString() @IsNotEmpty() waterSource: string;
  @IsOptional() @IsDateString() establishedOn?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(IrrigationStatus) status?: IrrigationStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) plannedCanalCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minBlocksPerCanal?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxBlocksPerCanal?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) hectaresPerBlock?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxHectaresPerFarmer?: number | null;
  @IsOptional() @IsBoolean() requireAllocationApproval?: boolean;
}

export class UpdateSchemeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(32) @Matches(CODE) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() region?: string;
  @IsOptional() @IsString() @IsNotEmpty() district?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsString() @IsNotEmpty() waterSource?: string;
  @IsOptional() @IsDateString() establishedOn?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(IrrigationStatus) status?: IrrigationStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) plannedCanalCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minBlocksPerCanal?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxBlocksPerCanal?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) hectaresPerBlock?: number;
  /** null clears the per-member limit. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxHectaresPerFarmer?: number | null;
  @IsOptional() @IsBoolean() requireAllocationApproval?: boolean;
}

export class CreateCanalDto {
  @IsUUID() schemeId: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) canalNumber: number;
  /** Defaults to C01, C02 … from the number. */
  @IsOptional() @IsString() @MaxLength(32) @Matches(CODE) code?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(IrrigationStatus) status?: IrrigationStatus;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthKm?: number;
  @IsOptional() @IsString() headworks?: string;
  @IsOptional() @IsString() @MaxLength(4000) infrastructureNotes?: string;
}

export class UpdateCanalDto {
  @IsOptional() @IsString() @MaxLength(32) @Matches(CODE) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(IrrigationStatus) status?: IrrigationStatus;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthKm?: number;
  @IsOptional() @IsString() headworks?: string;
  @IsOptional() @IsString() @MaxLength(4000) infrastructureNotes?: string;
}

export class CreateBlockDto {
  @IsUUID() canalId: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(999) blockNumber: number;
  @IsOptional() @IsString() @MaxLength(32) @Matches(CODE) code?: string;
  @IsEnum(IrrigationBlockSide) side: IrrigationBlockSide;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(IrrigationStatus) status?: IrrigationStatus;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpdateBlockDto {
  @IsOptional() @IsEnum(IrrigationBlockSide) side?: IrrigationBlockSide;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(IrrigationStatus) status?: IrrigationStatus;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** GeoJSON polygon coordinates (same convention as Farm.boundaryCoordinates). */
  @IsOptional() boundaryCoordinates?: unknown;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) centerLatitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) centerLongitude?: number;
  @IsOptional() @IsString() @MaxLength(4000) boundaryNotes?: string;
}

export class CreateHectareDto {
  @IsUUID() blockId: string;
  @Type(() => Number) @IsInt() @Min(1) hectareNumber: number;
}

export class AllocateHectareDto {
  @IsUUID() hectareId: string;
  @IsUUID() farmerId: string;
  /** The member who really owns this hectare when it is registered in someone else's name. */
  @IsOptional() @IsUUID() guardianId?: string;
  @IsOptional() @IsDateString() allocatedOn?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class SetGuardianDto {
  @IsUUID() guardianId: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class CreateTransferDto {
  @IsUUID() hectareId: string;
  @IsUUID() toFarmerId: string;
  @IsOptional() @IsDateString() transferDate?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

export class AppointLeaderDto {
  @IsEnum(IrrigationLeadershipPosition) position: IrrigationLeadershipPosition;
  @IsUUID() canalId: string;
  /** Required for BLOCK_LEADER. */
  @IsOptional() @IsUUID() blockId?: string;
  @IsUUID() farmerId: string;
  @IsOptional() @IsDateString() appointedOn?: string;
  @IsOptional() @IsDateString() termStart?: string;
  @IsOptional() @IsDateString() termEnd?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  /** Must be true to close an existing active appointment and replace it. */
  @IsOptional() @IsBoolean() replaceExisting?: boolean;
}

export class EndLeadershipDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsOptional() @IsDateString() endedOn?: string;
}

export class CreateDocumentDto {
  @IsUUID() schemeId: string;
  @IsOptional() @IsUUID() canalId?: string;
  @IsOptional() @IsUUID() blockId?: string;
  @IsOptional() @IsUUID() transferId?: string;
  @IsOptional() @IsUUID() leadershipId?: string;
  @IsOptional() @IsEnum(IrrigationDocumentType) type?: IrrigationDocumentType;
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsString() @IsNotEmpty() fileUrl: string;
  @IsString() @IsNotEmpty() fileName: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sizeBytes?: number;
}
