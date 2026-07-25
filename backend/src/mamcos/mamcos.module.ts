import { Module } from '@nestjs/common';
import { MamcosService } from './mamcos.service';
import { MamcosController } from './mamcos.controller';

@Module({
  controllers: [MamcosController],
  providers: [MamcosService],
  exports: [MamcosService],
})
export class MamcosModule {}
