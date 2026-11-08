import { Module } from '@nestjs/common';
import { ChargesModule } from '../charges/charges.module';
import { CommunicationsModule } from '../communications/communications.module';
import { DuesModule } from '../dues/dues.module';
import { FarmingSeasonsModule } from '../farming-seasons/farming-seasons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FarmDefaultsController } from './farm-defaults.controller';
import { FarmDefaultsScheduler } from './farm-defaults.scheduler';
import { FarmDefaultsService } from './farm-defaults.service';

@Module({
  imports: [ChargesModule, CommunicationsModule, DuesModule, FarmingSeasonsModule, NotificationsModule],
  controllers: [FarmDefaultsController],
  providers: [FarmDefaultsService, FarmDefaultsScheduler],
  exports: [FarmDefaultsService],
})
export class FarmDefaultsModule {}
