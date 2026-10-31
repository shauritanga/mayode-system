import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Outbound email over SMTP. Configure with SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (true for port 465),
 * SMTP_USER, SMTP_PASS and EMAIL_FROM. Without SMTP_HOST and EMAIL_FROM nothing is sent and callers are told
 * so through isConfigured(), so a message is never reported as delivered when it was not.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transport?: Transporter;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('SMTP_HOST') && this.config.get<string>('EMAIL_FROM'));
  }

  private client(): Transporter {
    if (!this.transport) {
      const user = this.config.get<string>('SMTP_USER');
      this.transport = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: Number(this.config.get<string>('SMTP_PORT') || 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        ...(user ? { auth: { user, pass: this.config.get<string>('SMTP_PASS') } } : {}),
      });
    }
    return this.transport;
  }

  /** Plain text for any client, plus a minimal HTML copy with the message escaped (never raw HTML from a user). */
  async send(to: string, subject: string, text: string): Promise<void> {
    const html = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    await this.client().sendMail({ from: this.config.get<string>('EMAIL_FROM'), to, subject, text, html });
  }
}
