import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './ownership.service';
import { ExportService } from './export.service';

/** Global cross-cutting helpers (row-level authorization, etc.). */
@Global()
@Module({
  providers: [OwnershipService, ExportService],
  exports: [OwnershipService, ExportService],
})
export class CommonModule {}
