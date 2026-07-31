import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface UssdPushResult {
  id: string;
  status: string; // PROCESSING | SUCCESS | FAILED | SETTLED | PENDING
  channel?: string;
  orderReference: string;
  collectedAmount?: string;
  collectedCurrency?: string;
  createdAt?: string;
  clientId?: string;
}

export interface PaymentStatusResult {
  id: string;
  status: string;
  paymentReference?: string;
  paymentPhoneNumber?: string;
  orderReference: string;
  collectedAmount?: string | number;
  collectedCurrency?: string;
  message?: string;
}

export interface ActiveMethod {
  name: string;
  status: string; // AVAILABLE | UNAVAILABLE
  fee?: number;
}

export interface PayoutResult {
  id: string;
  status: string; // PENDING | PROCESSING | SUCCESS | FAILED
  orderReference: string;
  amount?: string | number;
  currency?: string;
  createdAt?: string;
}

export interface PayoutStatusResult {
  id: string;
  status: string;
  orderReference: string;
  amount?: string | number;
  currency?: string;
  message?: string;
}

export interface AccountBalance {
  currency: string;
  available: string | number;
}

/**
 * ClickPesa mobile-money collection client (Tanzania).
 *
 * Docs: https://docs.clickpesa.com — auth token (1h), preview/initiate USSD-push,
 * payment query, and HMAC-SHA256 request checksums.
 *
 * The service is optional: when credentials are not configured (`isConfigured()`
 * is false) callers fall back to manual/admin membership approval so dev and demo
 * environments keep working without ClickPesa keys.
 */
@Injectable()
export class ClickPesaService {
  private readonly logger = new Logger(ClickPesaService.name);
  private readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly apiKey?: string;
  private readonly checksumKey?: string;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('CLICKPESA_BASE_URL') || 'https://api.clickpesa.com';
    this.clientId = this.config.get<string>('CLICKPESA_CLIENT_ID');
    this.apiKey = this.config.get<string>('CLICKPESA_API_KEY');
    this.checksumKey = this.config.get<string>('CLICKPESA_CHECKSUM_KEY');
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.apiKey);
  }

  // ---------------------------------------------------------------- checksum

  /** Recursively sort object keys alphabetically at every nesting level. */
  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.canonicalize(v));
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.canonicalize(obj[key]);
          return acc;
        }, {});
    }
    return value;
  }

  /**
   * ClickPesa checksum: HMAC-SHA256 over the canonicalized, compact-JSON payload
   * (excluding `checksum`/`checksumMethod`), returned as a 64-char hex digest.
   * Returns undefined when no checksum key is configured (checksum is optional).
   */
  generateChecksum(payload: Record<string, unknown>): string | undefined {
    if (!this.checksumKey) return undefined;
    const clean = { ...payload };
    delete clean.checksum;
    delete clean.checksumMethod;
    const json = JSON.stringify(this.canonicalize(clean));
    return createHmac('sha256', this.checksumKey).update(json).digest('hex');
  }

  // ------------------------------------------------------------------- token

  private async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }
    if (!this.isConfigured()) {
      throw new Error('ClickPesa is not configured');
    }
    const res = await fetch(`${this.baseUrl}/third-parties/generate-token`, {
      method: 'POST',
      headers: {
        'client-id': this.clientId!,
        'api-key': this.apiKey!,
      },
    });
    if (!res.ok) {
      throw new Error(`ClickPesa token request failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { success?: boolean; token?: string };
    if (!body.token) throw new Error('ClickPesa token response missing token');
    // Token is valid for 1 hour; refresh a little early (55 min).
    this.cachedToken = body.token.startsWith('Bearer ')
      ? body.token.slice(7)
      : body.token;
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    return this.cachedToken;
  }

  private async authedFetch(path: string, init: RequestInit): Promise<Response> {
    const token = await this.getToken();
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  }

  /** Normalize a Tanzanian phone number to ClickPesa's `2557XXXXXXXX` form. */
  static normalizePhone(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('255')) return digits;
    if (digits.startsWith('0')) return `255${digits.slice(1)}`;
    if (digits.length === 9) return `255${digits}`;
    return digits;
  }

  // ------------------------------------------------------------- collection

  /** Preview available mobile-money methods for an amount (optional pre-check). */
  async previewUssdPush(input: {
    amount: string;
    orderReference: string;
    phoneNumber?: string;
  }): Promise<{ activeMethods: ActiveMethod[] }> {
    const payload: Record<string, unknown> = {
      amount: input.amount,
      currency: 'TZS',
      orderReference: input.orderReference,
    };
    if (input.phoneNumber) {
      payload.phoneNumber = ClickPesaService.normalizePhone(input.phoneNumber);
    }
    const checksum = this.generateChecksum(payload);
    if (checksum) payload.checksum = checksum;

    const res = await this.authedFetch(
      '/third-parties/payments/preview-ussd-push-request',
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (!res.ok) {
      throw new Error(`ClickPesa preview failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { activeMethods: ActiveMethod[] };
  }

  /** Trigger a mobile-money USSD/PIN prompt on the payer's phone. */
  async initiateUssdPush(input: {
    amount: string;
    orderReference: string;
    phoneNumber: string;
  }): Promise<UssdPushResult> {
    const payload: Record<string, unknown> = {
      amount: input.amount,
      currency: 'TZS',
      orderReference: input.orderReference,
      phoneNumber: ClickPesaService.normalizePhone(input.phoneNumber),
    };
    const checksum = this.generateChecksum(payload);
    if (checksum) payload.checksum = checksum;

    const res = await this.authedFetch(
      '/third-parties/payments/initiate-ussd-push-request',
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (!res.ok) {
      throw new Error(`ClickPesa initiate failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as UssdPushResult;
  }

  /**
   * Authoritative server-to-server status check. Use this (not the raw webhook
   * body) to decide whether to activate — it can't be spoofed.
   */
  async queryPayment(orderReference: string): Promise<PaymentStatusResult | null> {
    const res = await this.authedFetch(
      `/third-parties/payments/${encodeURIComponent(orderReference)}`,
      { method: 'GET' },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClickPesa query failed: ${res.status} ${await res.text()}`);
    }
    // The query endpoint may return a single object or a list; normalize.
    const body = (await res.json()) as PaymentStatusResult | PaymentStatusResult[];
    const record = Array.isArray(body) ? body[0] : body;
    return record ?? null;
  }

  // ----------------------------------------------------------------- payout
  //
  // NOTE: ClickPesa's Payout API (docs.clickpesa.com/payout-api) is confirmed
  // to support mobile-money payout preview/create/query plus a balance check,
  // using the same auth-token/checksum pattern as collection above. The exact
  // path strings below follow ClickPesa's collection-endpoint naming
  // convention ("mno" = mobile network operator, matching their own payout
  // docs index) but were not directly visible in the fetched documentation
  // excerpt — confirm them against the live API reference (or ask ClickPesa
  // support) before relying on this in production, and update here if they
  // differ. All calls fail loudly (thrown error), so a wrong path surfaces
  // immediately rather than silently misrouting money.

  /** Check available payout balance before disbursing (recommended pre-flight). */
  async getAccountBalance(): Promise<AccountBalance> {
    const res = await this.authedFetch('/third-parties/accounts/balance', { method: 'GET' });
    if (!res.ok) {
      throw new Error(`ClickPesa balance check failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as AccountBalance;
  }

  /** Preview a mobile-money payout (fee/method check) before disbursing. */
  async previewMobilePayout(input: {
    amount: string;
    orderReference: string;
    phoneNumber: string;
  }): Promise<{ activeMethods: ActiveMethod[] }> {
    const payload: Record<string, unknown> = {
      amount: input.amount,
      currency: 'TZS',
      orderReference: input.orderReference,
      phoneNumber: ClickPesaService.normalizePhone(input.phoneNumber),
    };
    const checksum = this.generateChecksum(payload);
    if (checksum) payload.checksum = checksum;

    const res = await this.authedFetch('/third-parties/payouts/preview-mno-payout-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`ClickPesa payout preview failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { activeMethods: ActiveMethod[] };
  }

  /** Disburse money out to a farmer's mobile-money wallet. */
  async initiateMobilePayout(input: {
    amount: string;
    orderReference: string;
    phoneNumber: string;
    recipientName?: string;
  }): Promise<PayoutResult> {
    const payload: Record<string, unknown> = {
      amount: input.amount,
      currency: 'TZS',
      orderReference: input.orderReference,
      phoneNumber: ClickPesaService.normalizePhone(input.phoneNumber),
    };
    if (input.recipientName) payload.recipientName = input.recipientName;
    const checksum = this.generateChecksum(payload);
    if (checksum) payload.checksum = checksum;

    const res = await this.authedFetch('/third-parties/payouts/initiate-mno-payout-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`ClickPesa payout initiate failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as PayoutResult;
  }

  /** Authoritative server-to-server payout status check. */
  async queryPayoutStatus(orderReference: string): Promise<PayoutStatusResult | null> {
    const res = await this.authedFetch(
      `/third-parties/payouts/${encodeURIComponent(orderReference)}`,
      { method: 'GET' },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClickPesa payout query failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as PayoutStatusResult | PayoutStatusResult[];
    const record = Array.isArray(body) ? body[0] : body;
    return record ?? null;
  }
}
