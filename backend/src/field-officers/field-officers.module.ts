import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FieldOfficersController } from './field-officers.controller';
import { FieldOfficersService } from './field-officers.service';

@Module({
  imports: [AuthModule],
  controllers: [FieldOfficersController],
  providers: [FieldOfficersService],
  exports: [FieldOfficersService],
})
export class FieldOfficersModule {}
