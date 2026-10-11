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
 * Outbound SMS via Beem (SMS_PROVIDER=beem) or Africa's Talking (default).
 *
 * Africa's Talking:
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
  private readonly beemKey?: string;
  private readonly beemSecret?: string;
  private readonly beemSender: string;
  private readonly beemBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl =
      this.config.get<string>('AT_BASE_URL') ||
      'https://api.africastalking.com';
    this.username = this.config.get<string>('AT_USERNAME');
    this.apiKey = this.config.get<string>('AT_API_KEY');
    this.senderId = this.config.get<string>('AT_SENDER_ID');
    this.beemKey = this.config.get<string>('BEEM_API_KEY');
    this.beemSecret = this.config.get<string>('BEEM_SECRET_KEY');
    this.beemSender = this.config.get<string>('BEEM_SENDER_ID') || 'INFO';
    this.beemBaseUrl =
      this.config.get<string>('BEEM_BASE_URL') || 'https://apisms.beem.africa';
  }

  private provider(): 'beem' | 'africastalking' {
    return this.config.get<string>('SMS_PROVIDER')?.toLowerCase() === 'beem'
      ? 'beem'
      : 'africastalking';
  }

  isConfigured(): boolean {
    return this.provider() === 'beem'
      ? Boolean(this.beemKey && this.beemSecret)
      : Boolean(this.username && this.apiKey);
  }

  /** Send an SMS and record it in SmsLog. Never throws — SMS is best-effort. */
  async send(
    to: string,
    message: string,
    type = 'notification',
    /**
     * What to keep in SmsLog and the server log instead of `message`. Use it when the SMS carries a
     * secret (such as a private-listing code) that must reach the phone but not be stored.
     */
    logMessage?: string,
  ): Promise<void> {
    await this.sendTransactional(to, message, type, logMessage);
  }

  /**
   * Like `send`, but tells the caller whether the provider accepted the message (simulated mode
   * counts as accepted). Used where the user is waiting on the SMS, such as sign-in codes.
   */
  async sendTransactional(
    to: string,
    message: string,
    type = 'notification',
    logMessage?: string,
  ): Promise<boolean> {
    const phone = normalizeMsisdn(to);
    const recorded = logMessage ?? message;

    if (!this.isConfigured()) {
      await this.log(phone, recorded, type, 'simulated');
      this.logger.debug(`SMS (simulated) → ${phone}: ${recorded}`);
      return true;
    }

    try {
      const res =
        this.provider() === 'beem'
          ? await this.beemRequest(phone, message)
          : await this.atRequest(phone, message);
      const ok = res.ok;
      await this.log(phone, recorded, type, ok ? 'sent' : 'failed');
      if (!ok) {
        this.logger.error(
          `SMS to ${phone} failed: ${res.status} ${await res.text()}`,
        );
      }
      return ok;
    } catch (e) {
      await this.log(phone, recorded, type, 'failed');
      this.logger.error(
        `SMS to ${phone} error: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  private atRequest(phone: string, message: string) {
    const body = new URLSearchParams({
      username: this.username!,
      to: phone,
      message,
      ...(this.senderId ? { from: this.senderId } : {}),
    });
    return fetch(`${this.baseUrl}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey: this.apiKey!,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
  }

  /** Beem: POST /v1/send with Basic auth; recipients are digits only (255...). */
  private beemRequest(phone: string, message: string) {
    const auth = Buffer.from(`${this.beemKey}:${this.beemSecret}`).toString(
      'base64',
    );
    return fetch(`${this.beemBaseUrl}/v1/send`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_addr: this.beemSender,
        schedule_time: '',
        encoding: 0,
        message,
        recipients: [{ recipient_id: 1, dest_addr: phone.replace(/^\+/, '') }],
      }),
    });
  }

  async sendPaymentBreakdown(input: {
    phone: string;
    grossAmount: number;
    loanDeduction: number;
    netAmount: number;
    invoiceNumber: string;
  }) {
    return this.send(
      input.phone,
      `MAYODE: Sale ${input.invoiceNumber}. Gross TZS ${input.grossAmount.toLocaleString()}, loan repayment TZS ${input.loanDeduction.toLocaleString()}, net payment TZS ${input.netAmount.toLocaleString()}.`,
      'payment_breakdown',
    );
  }

  private async log(
    phone: string,
    message: string,
    type: string,
    status: string,
  ) {
    try {
      await this.prisma.smsLog.create({
        data: {
          phone,
          message,
          type,
          status,
          sentAt:
            status === 'sent' || status === 'simulated' ? new Date() : null,
        },
      });
    } catch (e) {
      this.logger.error(
        `Failed to record SmsLog: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
