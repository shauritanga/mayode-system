import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PermissionAction } from '@prisma/client';

export class ResourcePermissionEntryDto {
  @ApiProperty({ example: 'farmers' })
  @IsString()
  @IsNotEmpty()
  resourceKey: string;

  @ApiProperty({ enum: PermissionAction, isArray: true, example: ['VIEW', 'EDIT'] })
  @IsArray()
  @ArrayUnique()
  @IsEnum(PermissionAction, { each: true })
  actions: PermissionAction[];
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [ResourcePermissionEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourcePermissionEntryDto)
  permissions: ResourcePermissionEntryDto[];
}
