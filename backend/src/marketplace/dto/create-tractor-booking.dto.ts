import { IsString, IsNotEmpty, IsNumber, IsEnum, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FarmGrade } from '@prisma/client';

export class CreateTractorBookingDto {
  @ApiProperty({ example: 'tractor-uuid-here', description: 'ID of the Tractor being booked' })
  @IsString()
  @IsNotEmpty()
  tractorId: string;

  @ApiProperty({ example: 'farmer-uuid-here', description: 'ID of the Farmer booking the tractor' })
  @IsString()
  @IsNotEmpty()
  farmerId: string;

  @ApiProperty({ example: 4.5, description: 'Number of hectares to be plowed' })
  @IsNumber()
  @Min(0.1)
  hectares: number;

  @ApiProperty({ example: FarmGrade.B, enum: FarmGrade, description: 'Terrain grade of the farm (affects surcharge: A=0%, B=10%, C=25%)' })
  @IsEnum(FarmGrade)
  terrainGrade: FarmGrade;

  @ApiProperty({ example: 0.05, description: 'M-LAX platform commission rate (e.g., 0.05 for 5%)' })
  @IsNumber()
  @Min(0)
  commissionRate: number;

  @ApiProperty({ example: '2026-12-15T08:00:00Z', description: 'Scheduled date for tractor service' })
  @IsDateString()
  scheduledDate: string;
}
