import { Module } from '@nestjs/common';
import { RiceProtocolsController } from './rice-protocols.controller';
import { RiceProtocolsService } from './rice-protocols.service';

@Module({ controllers: [RiceProtocolsController], providers: [RiceProtocolsService], exports: [RiceProtocolsService] })
export class RiceProtocolsModule {}
