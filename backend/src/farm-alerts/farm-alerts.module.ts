import { Module } from '@nestjs/common';
import { FarmAlertsService } from './farm-alerts.service';
import { FarmAlertsController } from './farm-alerts.controller';
import { AlertsSchedulerService } from './alerts-scheduler.service';

@Module({
  controllers: [FarmAlertsController],
  providers: [FarmAlertsService, AlertsSchedulerService],
  exports: [FarmAlertsService],
})
export class FarmAlertsModule {}
