import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { DuesController } from './dues.controller';
import { DuesService } from './dues.service';

@Module({ imports: [AccountingModule], controllers: [DuesController], providers: [DuesService], exports: [DuesService] })
export class DuesModule {}
