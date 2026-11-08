import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { EmailService } from './email.service';

@Module({ controllers: [CommunicationsController], providers: [CommunicationsService, EmailService], exports: [CommunicationsService] })
export class CommunicationsModule {}
