import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMsisdn } from './sms.service';

export interface WhatsappResult {
  ok: boolean;
  status: 'sent' | 'simulated' | 'failed';
  detail?: string;
}

/** Template parameters may not hold newlines, tabs or long runs of spaces. */
export const cleanTemplateParam = (text: string, max = 900) =>
  text.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max);

/**
 * WhatsApp Business messages through Meta's Cloud API. Business-started messages must use an
 * approved template, so alerts go out as a template with the title and message as its two
 * parameters. Without WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID the message is only recorded
 * (status "simulated"), exactly as SMS does, so everything else keeps working.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly token?: string;
  private readonly phoneNumberId?: string;
  private readonly version: string;
  readonly alertTemplate: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.token = this.config.get<string>('WHATSAPP_TOKEN');
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.version = this.config.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    this.alertTemplate = this.config.get<string>('WHATSAPP_ALERT_TEMPLATE') || 'weather_alert';
  }

  isConfigured() {
    return Boolean(this.token && this.phoneNumberId);
  }

  async sendTemplate(
    to: string,
    template: string,
    language: 'sw' | 'en',
    params: string[],
    type = 'whatsapp',
  ): Promise<WhatsappResult> {
    const phone = normalizeMsisdn(to);
    const logText = `[${template}/${language}] ${params.join(' | ')}`;
    if (!this.isConfigured()) {
      await this.log(phone, logText, type, 'simulated');
      return { ok: true, status: 'simulated' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: cleanTemplateParam(text) })) }],
          },
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        this.logger.error(`WhatsApp to ${phone} failed: ${res.status} ${detail}`);
        await this.log(phone, logText, type, 'failed');
        return { ok: false, status: 'failed', detail: `${res.status} ${detail}` };
      }
      await this.log(phone, logText, type, 'sent');
      return { ok: true, status: 'sent' };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.logger.error(`WhatsApp to ${phone} error: ${detail}`);
      await this.log(phone, logText, type, 'failed');
      return { ok: false, status: 'failed', detail };
    }
  }

  private async log(phone: string, message: string, type: string, status: string) {
    try {
      await this.prisma.smsLog.create({
        data: { phone, message, type, status, sentAt: status === 'sent' || status === 'simulated' ? new Date() : null },
      });
    } catch (e) {
      this.logger.warn(`Could not log WhatsApp message: ${e instanceof Error ? e.message : e}`);
    }
  }
}
