import { Module } from '@nestjs/common';
import { FarmRegistryService } from './farm-registry.service';
import { FarmRegistryController } from './farm-registry.controller';

@Module({
  controllers: [FarmRegistryController],
  providers: [FarmRegistryService],
  exports: [FarmRegistryService],
})
export class FarmRegistryModule {}
