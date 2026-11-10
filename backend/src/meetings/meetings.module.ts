import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsScheduler } from './meetings.scheduler';
import { MeetingsService } from './meetings.service';

@Module({ imports: [NotificationsModule], controllers: [MeetingsController], providers: [MeetingsService, MeetingsScheduler], exports: [MeetingsService] })
export class MeetingsModule {}
