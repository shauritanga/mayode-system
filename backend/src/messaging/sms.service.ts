import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** Normalize a Tanzanian phone number to E.164 (+2557XXXXXXXX) for storage/matching. */
export function normalizeMsisdn(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0')) return `+255${digits.slice(1)}`;
  if (digits.length === 9) return `+255${digits}`;
  return `+${digits}`;
}

/**
 * Outbound SMS via Africa's Talking (the East-Africa aggregator standard).
 *
 * Docs: https://developers.africastalking.com/docs/sms/overview
 *   POST {baseUrl}/version1/messaging
 *   headers: apiKey, Content-Type: application/x-www-form-urlencoded, Accept: application/json
 *   form: username, to, message, from (sender id)
 *
 * Optional: when AT credentials are not configured, messages are still recorded
 * in SmsLog with status "simulated" so the app (and demos) keep working — the
 * feature-phone confirmation logic does not depend on a live SMS provider.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly baseUrl: string;
  private readonly username?: string;
  private readonly apiKey?: string;
  private readonly senderId?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl =
      this.config.get<string>('AT_BASE_URL') || 'https://api.africastalking.com';
    this.username = this.config.get<string>('AT_USERNAME');
    this.apiKey = this.config.get<string>('AT_API_KEY');
    this.senderId = this.config.get<string>('AT_SENDER_ID');
  }

  isConfigured(): boolean {
    return Boolean(this.username && this.apiKey);
  }

  /** Send an SMS and record it in SmsLog. Never throws — SMS is best-effort. */
  async send(to: string, message: string, type = 'notification'): Promise<void> {
    const phone = normalizeMsisdn(to);

    if (!this.isConfigured()) {
      await this.log(phone, message, type, 'simulated');
      this.logger.debug(`SMS (simulated) → ${phone}: ${message}`);
      return;
    }

    try {
      const body = new URLSearchParams({
        username: this.username!,
        to: phone,
        message,
        ...(this.senderId ? { from: this.senderId } : {}),
      });
      const res = await fetch(`${this.baseUrl}/version1/messaging`, {
        method: 'POST',
        headers: {
          apiKey: this.apiKey!,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });
      const ok = res.ok;
      await this.log(phone, message, type, ok ? 'sent' : 'failed');
      if (!ok) {
        this.logger.error(`SMS to ${phone} failed: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      await this.log(phone, message, type, 'failed');
      this.logger.error(`SMS to ${phone} error: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async log(phone: string, message: string, type: string, status: string) {
    try {
      await this.prisma.smsLog.create({
        data: {
          phone,
          message,
          type,
          status,
          sentAt: status === 'sent' || status === 'simulated' ? new Date() : null,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to record SmsLog: ${e instanceof Error ? e.message : e}`);
    }
  }
}
