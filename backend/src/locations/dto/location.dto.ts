import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRegionDto {
  @IsString() @IsNotEmpty() name: string;
}

export class CreateDistrictDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() regionId: string;
}

export class CreateWardDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() districtId: string;
}

export class UpdateLocationNameDto {
  @IsString() @IsNotEmpty() name: string;
}
