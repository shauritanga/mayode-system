import { Module } from '@nestjs/common';
import { RiceProtocolsController } from './rice-protocols.controller';
import { RiceProtocolsService } from './rice-protocols.service';
import { CalendarRemindersService } from './calendar-reminders.service';
import { FarmingHistoryService } from './farming-history.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [RiceProtocolsController],
  providers: [RiceProtocolsService, CalendarRemindersService, FarmingHistoryService],
  exports: [RiceProtocolsService, CalendarRemindersService, FarmingHistoryService],
})
export class RiceProtocolsModule {}
