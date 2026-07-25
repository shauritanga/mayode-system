import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

/**
 * Global so any feature service can inject NotificationsService to enqueue
 * in-app alerts (e.g. FarmersService on verification events). Notifications are
 * also delivered to devices via Expo push (PushService).
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
