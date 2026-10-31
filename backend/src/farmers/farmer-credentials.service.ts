import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../messaging/sms.service';
import { generateTemporaryPassword, redactPassword, welcomeSms } from '../field-officers/officer-credentials';

/** Sends a newly registered farmer their sign-in details. The password is never stored in the SMS log. */
@Injectable()
export class FarmerCredentialsService {
  constructor(private readonly sms: SmsService, private readonly config: ConfigService) {}

  temporaryPassword() { return generateTemporaryPassword(); }

  async send(phone: string, firstName: string, language: string | null | undefined, password: string): Promise<boolean> {
    const text = welcomeSms({
      firstName, phone, password, language, account: 'farmer',
      portalUrl: this.config.get<string>('FARMER_PORTAL_URL') || this.config.get<string>('PORTAL_URL') || undefined,
      appUrl: this.config.get<string>('MOBILE_APP_URL') || undefined,
    });
    return this.sms.sendTransactional(phone, text, 'farmer_credentials', redactPassword(text, password));
  }
}
