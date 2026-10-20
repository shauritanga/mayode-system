import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { InsightsService } from './insights.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, InsightsService],
})
export class IntegrationsModule {}
