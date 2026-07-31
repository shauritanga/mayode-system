import { IsEnum, IsNumber, IsObject, IsOptional, Min } from 'class-validator';
import { ProjectStatus } from '@prisma/client';
export class UpdateProjectDto {
  @IsOptional() @IsNumber() @Min(0) spentAmount?: number;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsObject() milestones?: Record<string, unknown>;
}
