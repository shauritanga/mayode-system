import { Module } from '@nestjs/common';
import { DuesModule } from '../dues/dues.module';
import { CreditInterestController } from './credit-interest.controller';
import { CreditInterestScheduler } from './credit-interest.scheduler';
import { CreditInterestService } from './credit-interest.service';

@Module({ imports: [DuesModule], controllers: [CreditInterestController], providers: [CreditInterestService, CreditInterestScheduler], exports: [CreditInterestService] })
export class CreditInterestModule {}
