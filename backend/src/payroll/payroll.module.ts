import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({ imports: [AccountingModule], controllers: [PayrollController], providers: [PayrollService] })
export class PayrollModule {}
