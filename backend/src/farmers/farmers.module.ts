import { Module } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { FarmersController } from './farmers.controller';
import { FinanceModule } from '../finance/finance.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [FinanceModule, UploadsModule],
  controllers: [FarmersController],
  providers: [FarmersService],
  exports: [FarmersService],
})
export class FarmersModule {}
