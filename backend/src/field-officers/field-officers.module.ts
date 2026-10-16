import { Module } from '@nestjs/common';
import { FieldOfficersController } from './field-officers.controller';
import { FieldOfficersService } from './field-officers.service';

@Module({
  controllers: [FieldOfficersController],
  providers: [FieldOfficersService],
  exports: [FieldOfficersService],
})
export class FieldOfficersModule {}
