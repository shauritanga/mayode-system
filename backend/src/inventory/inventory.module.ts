import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { RiceProtocolsModule } from '../rice-protocols/rice-protocols.module';
import { ActivitiesModule } from '../activities/activities.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [RiceProtocolsModule, ActivitiesModule, AccountingModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
