import { Module } from '@nestjs/common';
import { ChargesController } from './charges.controller';
import { ChargesService } from './charges.service';
import { LatePenaltyScheduler } from './late-penalty.scheduler';

@Module({ controllers: [ChargesController], providers: [ChargesService, LatePenaltyScheduler], exports: [ChargesService] })
export class ChargesModule {}
