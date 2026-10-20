import { FarmInputType, TaskPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CreateTaskDto {
  @IsString() farmId: string;
  @IsOptional() @IsString() plotId?: string;
  @IsOptional() @IsString() cropCycleId?: string;
  @IsString() activityType: string;
  @IsString() title: string;
  @IsOptional() @IsString() instructions?: string;
  @IsString() assigneeUserId: string;
  @IsOptional() @IsString() reviewerUserId?: string;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsString() expectedOutput?: string;
  @IsOptional() @IsString() requiredInputs?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
  @IsOptional() @IsBoolean() requireGps?: boolean;
  @IsOptional() @IsInt() @Min(20) @Max(5000) geofenceM?: number;
  @IsOptional() @IsString() parentTaskId?: string;
}

export class CreateInspectionDto {
  @IsString() farmId: string;
  @IsOptional() @IsString() plotId?: string;
  @IsOptional() @IsString() cropCycleId?: string;
  @IsString() assigneeUserId: string;
  @IsString() objective: string;
  @IsDateString() scheduledFor: string;
  @IsOptional() @IsString() reviewerUserId?: string;
  @IsOptional() @IsInt() @Min(20) @Max(5000) geofenceM?: number;
}

export class CheckInDto {
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
  @IsOptional() @IsNumber() @Min(0) accuracyM?: number;
  @IsDateString() deviceTime: string;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
  @IsOptional() @IsString() note?: string;
  /** Generated on the phone, so a retry of the same check-in is recognised and not recorded twice. */
  @IsOptional() @IsString() clientKey?: string;
  @IsOptional() @IsIn(['CHECK_IN', 'CHECK_OUT']) kind?: 'CHECK_IN' | 'CHECK_OUT';
}

export class StartWithoutGpsDto {
  @IsString() reason: string;
}

export class ReportInputDto {
  @IsString() itemId: string;
  @IsNumber() @IsPositive() quantity: number;
}

export class SubmitReportDto {
  @IsOptional() @IsDateString() actualStart?: string;
  @IsOptional() @IsDateString() actualEnd?: string;
  @IsOptional() @IsNumber() @Min(0) workDoneQty?: number;
  @IsOptional() @IsString() workDoneUnit?: string;
  @IsOptional() @IsString() equipment?: string;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsString() incompleteReason?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReportInputDto) inputs?: ReportInputDto[];
}

export class RecommendationDto {
  @IsString() text: string;
  @IsOptional() @IsString() suggestedActivity?: string;
}

export class SubmitInspectionDto {
  @IsOptional() @IsString() cropCondition?: string;
  @IsOptional() @IsString() growthStage?: string;
  @IsOptional() @IsString() pests?: string;
  @IsOptional() @IsString() diseases?: string;
  @IsOptional() @IsString() soilWater?: string;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecommendationDto) recommendations?: RecommendationDto[];
}

export class FollowUpDto {
  @IsString() title: string;
  @IsString() activityType: string;
  @IsString() assigneeUserId: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
}

export class ReviewTaskDto {
  @IsIn(['APPROVE', 'REJECT', 'RETURN']) decision: 'APPROVE' | 'REJECT' | 'RETURN';
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FollowUpDto) followUps?: FollowUpDto[];
}

export class UpsertInputItemDto {
  @IsString() name: string;
  @IsEnum(FarmInputType) type: FarmInputType;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class StockInDto {
  @IsNumber() @IsPositive() quantity: number;
  @IsOptional() @IsString() note?: string;
}

export class AdjustInputDto {
  @IsNumber() quantity: number;
  @IsString() reason: string;
}

export class CreateHarvestDto {
  @IsString() farmId: string;
  @IsOptional() @IsString() plotId?: string;
  @IsString() cropCycleId: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsDateString() harvestDate: string;
  @IsOptional() @IsNumber() @Min(0) estimatedKg?: number;
  @IsNumber() @IsPositive() actualKg: number;
  @IsOptional() @IsString() team?: string;
  @IsOptional() @IsString() responsibleUserId?: string;
  @IsOptional() @IsString() qualityNotes?: string;
  @IsOptional() @IsIn(['WAREHOUSE', 'OTHER']) destination?: 'WAREHOUSE' | 'OTHER';
}

export class TransportDto {
  @IsNumber() @IsPositive() transportedKg: number;
  @IsOptional() @IsString() note?: string;
}

export class UpsertFarmDto {
  @IsOptional() @IsString() managerUserId?: string;
  @IsOptional() @IsNumber() centerLatitude?: number;
  @IsOptional() @IsNumber() centerLongitude?: number;
  /** GeoJSON Polygon of the farm's boundary, or null to clear it. Checked in the service. */
  @IsOptional() boundaryCoordinates?: Record<string, unknown> | null;
  @IsOptional() @IsBoolean() isMayodeFarm?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateMayodeFarmDto {
  @IsString() name: string;
  @IsOptional() @IsString() farmCode?: string;
  @IsNumber() @IsPositive() socialHectares: number;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsNumber() centerLatitude?: number;
  @IsOptional() @IsNumber() centerLongitude?: number;
  /** GeoJSON Polygon of the farm's boundary. Checked in the service. */
  @IsOptional() boundaryCoordinates?: Record<string, unknown> | null;
  @IsOptional() @IsString() soilType?: string;
  @IsOptional() @IsString() soilFertility?: string;
  @IsOptional() @IsString() waterSource?: string;
  @IsOptional() @IsString() irrigationMethod?: string;
  @IsOptional() @IsBoolean() hasIrrigation?: boolean;
  @IsOptional() @IsString() managerUserId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(0) @ValidateNested({ each: true }) @Type(() => NewPlotDto) plots?: NewPlotDto[];
}

export class NewPlotDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @IsPositive() sizeAcres?: number;
  @IsOptional() @IsNumber() centerLatitude?: number;
  @IsOptional() @IsNumber() centerLongitude?: number;
  @IsOptional() @IsString() soilCondition?: string;
  @IsOptional() @IsString() irrigationStatus?: string;
}

export class NewCropCycleDto {
  @IsString() farmId: string;
  @IsString() plotId: string;
  @IsString() season: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsDateString() plantingDate?: string;
  @IsOptional() @IsDateString() expectedHarvest?: string;
  @IsOptional() @IsNumber() @IsPositive() areaPlantedHa?: number;
  @IsOptional() @IsNumber() @IsPositive() estimatedYieldKg?: number;
}
