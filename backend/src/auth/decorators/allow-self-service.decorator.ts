import { SetMetadata } from '@nestjs/common';

/** Marks an endpoint that authenticates ownership in its service layer. */
export const ALLOW_SELF_SERVICE_KEY = 'allow_self_service';
export const AllowSelfService = () => SetMetadata(ALLOW_SELF_SERVICE_KEY, true);
