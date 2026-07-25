import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

/** Global cross-cutting helpers (row-level authorization, etc.). */
@Global()
@Module({
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class CommonModule {}
