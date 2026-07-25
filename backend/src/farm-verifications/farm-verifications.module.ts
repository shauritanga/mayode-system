import { Module } from '@nestjs/common';
import { FarmVerificationsService } from './farm-verifications.service';
import { FarmVerificationsController } from './farm-verifications.controller';

@Module({
  controllers: [FarmVerificationsController],
  providers: [FarmVerificationsService],
  exports: [FarmVerificationsService],
})
export class FarmVerificationsModule {}
