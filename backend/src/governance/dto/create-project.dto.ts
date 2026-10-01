import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
export class CreateProjectDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() fundingSource: string;
  @IsNumber() @Min(0.01) budget: number;
  @IsOptional() @IsObject() milestones?: Record<string, unknown>;
}
