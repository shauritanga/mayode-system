import { Module } from '@nestjs/common';
import { AmcosRentalsService } from './amcos-rentals.service';
import { AmcosRentalsController } from './amcos-rentals.controller';

@Module({ controllers: [AmcosRentalsController], providers: [AmcosRentalsService], exports: [AmcosRentalsService] })
export class AmcosRentalsModule {}
