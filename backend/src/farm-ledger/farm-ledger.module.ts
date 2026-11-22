import { Module } from '@nestjs/common';
import { FarmLedgerController } from './farm-ledger.controller';
import { FarmAccountService } from './farm-account.service';

@Module({ controllers: [FarmLedgerController], providers: [FarmAccountService], exports: [FarmAccountService] })
export class FarmLedgerModule {}
