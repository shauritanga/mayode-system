import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractorPortalController, TendersController, TendersPublicController } from './tenders.controller';
import { ContractorsService } from './contractors.service';
import { TenderMilestonesService } from './tender-milestones.service';
import { TendersService } from './tenders.service';

@Module({
  imports: [AccountingModule, NotificationsModule],
  controllers: [TendersPublicController, TendersController, ContractorPortalController],
  providers: [TendersService, ContractorsService, TenderMilestonesService],
  exports: [TendersService],
})
export class TendersModule {}
