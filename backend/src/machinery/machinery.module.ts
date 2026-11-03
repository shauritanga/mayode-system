import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { MachineryController } from './machinery.controller';
import { MachineryService } from './machinery.service';

@Module({ imports: [AccountingModule], controllers: [MachineryController], providers: [MachineryService] })
export class MachineryModule {}
