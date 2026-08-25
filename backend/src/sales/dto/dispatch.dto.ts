import { DispatchTransportMode } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDispatchDto {
  @IsEnum(DispatchTransportMode) transportMode: DispatchTransportMode;
  @IsOptional() @IsNumber() @Min(0) transportFee?: number;
  @IsString() vehiclePlateNumber: string;
  @IsString() driverName: string;
  @IsString() driverPhone: string;
  @IsOptional() @IsString() notes?: string;
}
