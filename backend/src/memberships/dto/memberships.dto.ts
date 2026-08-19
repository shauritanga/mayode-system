import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { MembershipDurationType } from '@prisma/client';

export class CreateMembershipPlanDto {
  @ApiProperty({ example: 'Season Premium' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Full analytics and recommendations for one farming season',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 15000, description: 'Price in TZS' })
  @IsNumber()
  @Min(0)
  priceTzs: number;

  @ApiPropertyOptional({
    enum: MembershipDurationType,
    default: MembershipDurationType.SEASON,
  })
  @IsOptional()
  @IsEnum(MembershipDurationType)
  durationType?: MembershipDurationType;

  @ApiPropertyOptional({
    type: [String],
    example: ['Farm analytics', 'Yield forecasts'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class StartMembershipDto {
  @ApiProperty({ description: 'Membership plan ID' })
  @IsUUID()
  planId: string;

  @ApiPropertyOptional({ description: 'Farming season the membership covers' })
  @IsOptional()
  @IsUUID()
  farmingSeasonId?: string;

  @ApiPropertyOptional({
    example: '+255712345678',
    description:
      'Mobile-money phone number to charge (defaults to the account phone)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber?: string;
}

export class ApproveMembershipDto {
  @ApiPropertyOptional({
    example: 'MPESA-QX12345',
    description: 'Mobile money / bank payment reference',
  })
  @IsOptional()
  @IsString()
  paymentReference?: string;
}
