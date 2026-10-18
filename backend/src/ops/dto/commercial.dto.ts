import { OpsPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';

export class DocLineDto {
  @IsString() productId: string;
  @IsNumber() @IsPositive() quantity: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
}

export class CreateQuotationDto {
  @IsString() customerId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DocLineDto) lines: DocLineDto[];
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() deliveryMode?: string;
  @IsOptional() @IsString() deliveryNote?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateOrderDto extends CreateQuotationDto {
  @IsOptional() @IsString() quotationId?: string;
}

export class UpdateOrderDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DocLineDto) lines?: DocLineDto[];
  @IsOptional() @IsString() deliveryMode?: string;
  @IsOptional() @IsString() deliveryNote?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReviewOrderDto {
  @IsIn(['APPROVE', 'RETURN']) decision: 'APPROVE' | 'RETURN';
  @IsOptional() @IsString() comment?: string;
}

export class IssueInvoiceDto {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() paymentInstructions?: string;
}

export class RecordPaymentDto {
  @IsNumber() @IsPositive() amount: number;
  @IsEnum(OpsPaymentMethod) method: OpsPaymentMethod;
  @IsString() reference: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() payerName?: string;
}

export class MobilePaymentDto {
  @IsString() phoneNumber: string;
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
}

export class ControlNumberDto {
  @IsString() controlNumber: string;
  @IsOptional() @IsString() source?: string;
}

export class AuthorizeDto {
  @IsOptional() @IsString() overrideReason?: string;
}

export class PickDto {
  @IsString() batchId: string;
  @IsNumber() @IsPositive() quantityKg: number;
}

export class AllocLineDto {
  @IsString() orderLineId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PickDto) picks: PickDto[];
}

export class AllocateDto {
  @IsString() warehouseId: string;
  @IsOptional() @IsBoolean() auto?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AllocLineDto) lines?: AllocLineDto[];
}

export class DispatchLineDto {
  @IsString() orderLineId: string;
  @IsString() batchId: string;
  @IsNumber() @IsPositive() quantityKg: number;
  @IsOptional() @IsInt() @Min(1) packages?: number;
}

export class PrepareDispatchDto {
  @IsString() warehouseId: string;
  @IsString() vehiclePlate: string;
  @IsString() driverName: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() transporter?: string;
  @IsOptional() @IsDateString() dispatchAt?: string;
  @IsOptional() @IsString() supervisorName?: string;
  @IsOptional() @IsString() supervisorUserId?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DispatchLineDto) lines: DispatchLineDto[];
}

export class DeliveryDto {
  @IsIn(['DELIVERED', 'EXCEPTION']) state: 'DELIVERED' | 'EXCEPTION';
  @IsOptional() @IsString() receivedBy?: string;
  @IsOptional() @IsString() note?: string;
}

export class ShortageDto {
  @IsString() note: string;
}
