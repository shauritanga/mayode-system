import { Module } from '@nestjs/common';
import { DisputesModule } from '../disputes/disputes.module';
import { FarmRegistryService } from './farm-registry.service';
import { FarmRegistryController } from './farm-registry.controller';

@Module({
  imports: [DisputesModule],
  controllers: [FarmRegistryController],
  providers: [FarmRegistryService],
  exports: [FarmRegistryService],
})
export class FarmRegistryModule {}
