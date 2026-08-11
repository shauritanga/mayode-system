import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
