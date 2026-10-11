import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateOrgSettingsDto {
  @IsString() @IsNotEmpty() orgName: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() address?: string;
}

export class UpsertNotificationTemplateDto {
  @IsString() @IsNotEmpty() key: string;
  @IsString() @IsNotEmpty() channel: string;
  @IsOptional() @IsString() title?: string;
  @IsString() @IsNotEmpty() body: string;
}

export class UpdateSalesSettingsDto {
  /** Percent of the ordered weight a truck load may differ by (weighbridge and bag-count differences). */
  @IsNumber() @Min(0) @Max(10) loadTolerancePct: number;
  /** Days before an unconfirmed sale order releases its reserved stock. 0 turns expiry off. */
  @IsInt() @Min(0) @Max(90) reservationExpiryDays: number;
}

export class UpdateCalendarSettingsDto {
  /** Farmers are reminded this many days before a rice-calendar activity is due (0 = only on the day). */
  @IsInt() @Min(0) @Max(7) reminderLeadDays: number;
  /** An activity counts as missed this many days after its due date. */
  @IsInt() @Min(1) @Max(14) missedGraceDays: number;
  /** Also send reminders and missed notices by SMS. */
  @IsBoolean() reminderBySms: boolean;
}
