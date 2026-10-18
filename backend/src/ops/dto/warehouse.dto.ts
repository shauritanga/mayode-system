import { ApiPropertyOptional } from '@nestjs/swagger';
import { InspectionResult, OutputKind, ProcessingKind, ReceiptSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

export class CreateReceiptDto {
  @IsString() warehouseId: string;
  @IsString() productId: string;
  @IsEnum(ReceiptSource) sourceType: ReceiptSource;
  @IsOptional() @IsString() farmerId?: string;
  @IsOptional() @IsString() sellerName?: string;
  @IsOptional() @IsString() sellerPhone?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsOptional() @IsString() plotId?: string;
  @IsOptional() @IsString() cropCycleId?: string;
  @IsOptional() @IsString() harvestRecordId?: string;
  @IsOptional() @IsString() harvestBatchRef?: string;
  @IsOptional() @IsString() riceVariety?: string;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsNumber() @IsPositive() grossKg: number;
  @IsOptional() @IsInt() @Min(1) bags?: number;
  @IsOptional() @IsNumber() @IsPositive() bagWeightKg?: number;
  @IsOptional() @IsNumber() @Min(0) moisturePct?: number;
  @IsOptional() @IsString() qualityGrade?: string;
  @IsOptional() @IsEnum(InspectionResult) inspection?: InspectionResult;
  @IsOptional() @IsNumber() @Min(0) rejectedKg?: number;
  @IsOptional() @IsString() inspectionNotes?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
  @ApiPropertyOptional({ description: 'Confirm straight away, so the stock is added now' })
  @IsOptional() @IsBoolean() confirmNow?: boolean;
}

export class ReasonDto {
  @IsString() reason: string;
}

export class AdjustStockDto {
  @IsString() batchId: string;
  @IsString() warehouseId: string;
  @ApiPropertyOptional({ description: 'Positive adds stock, negative removes it' })
  @IsNumber() quantityKg: number;
  @IsEnum({ ADJUSTMENT: 'ADJUSTMENT', WRITE_OFF: 'WRITE_OFF' }) type: 'ADJUSTMENT' | 'WRITE_OFF';
  @IsString() reason: string;
}

export class TransferDto {
  @IsString() batchId: string;
  @IsString() fromWarehouseId: string;
  @IsString() toWarehouseId: string;
  @IsNumber() @IsPositive() quantityKg: number;
  @IsOptional() @IsString() note?: string;
}

export class ReceiveTransferDto {
  @IsNumber() @Min(0) receivedKg: number;
  @IsOptional() @IsString() note?: string;
}

export class RunInputDto {
  @IsString() batchId: string;
  @IsNumber() @IsPositive() quantityKg: number;
}

export class RunOutputDto {
  @IsEnum(OutputKind) kind: OutputKind;
  @IsNumber() @IsPositive() quantityKg: number;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() destinationLocation?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreateRunDto {
  @IsEnum(ProcessingKind) kind: ProcessingKind;
  @IsString() warehouseId: string;
  @IsOptional() @IsDateString() processedAt?: string;
  @IsOptional() @IsString() machine?: string;
  @IsOptional() @IsString() operatorName?: string;
  @IsOptional() @IsString() lossNote?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RunInputDto) inputs: RunInputDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => RunOutputDto) outputs: RunOutputDto[];
}
