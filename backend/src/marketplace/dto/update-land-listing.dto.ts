import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLandListingDto } from './create-land-listing.dto';

/** Owner can edit any listing term while it's still DRAFT; farm/owner never change here. */
export class UpdateLandListingDto extends PartialType(
  OmitType(CreateLandListingDto, ['farmId', 'ownerId'] as const),
) {}
