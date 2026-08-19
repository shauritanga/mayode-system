import { Module } from '@nestjs/common';
import { FarmersModule } from '../farmers/farmers.module';
import { PartnerApiController } from './partner-api.controller';
import { PartnerApiGuard } from './partner-api.guard';
import { PartnerApiService } from './partner-api.service';
@Module({
  imports: [FarmersModule],
  controllers: [PartnerApiController],
  providers: [PartnerApiService, PartnerApiGuard],
})
export class PartnerApiModule {}
