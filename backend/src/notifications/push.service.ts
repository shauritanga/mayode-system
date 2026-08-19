import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** An Expo push token looks like ExponentPushToken[xxxx] or ExpoPushToken[xxxx]. */
function isExpoToken(token: string | null | undefined): token is string {
  return !!token && /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/**
 * Delivers notifications to devices via the Expo Push service. Only the token
 * string is needed server-side (Expo handles FCM/APNs), so no Firebase creds
 * are required. Best-effort: missing/invalid tokens are skipped, and tokens
 * Expo reports as unregistered are cleared so we stop sending to dead devices.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly baseUrl: string;
  private readonly accessToken?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = this.config.get<string>('EXPO_PUSH_URL') || EXPO_PUSH_URL;
    this.accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
  }

  /** Push to a single user by id (looks up their stored Expo token). */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    if (!isExpoToken(user?.pushToken)) return;
    await this.sendToTokens([user.pushToken], message);
  }

  /** Push to many users by id (batched by Expo's 100-message limit). */
  async sendToUsers(userIds: string[], message: PushMessage): Promise<void> {
    if (userIds.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { pushToken: true },
    });
    const tokens = users.map((u) => u.pushToken).filter(isExpoToken);
    await this.sendToTokens(tokens, message);
  }

  /**
   * Post messages to Expo and reconcile the response. Never throws — push is
   * best-effort and must not break the enqueue path.
   */
  private async sendToTokens(
    tokens: string[],
    message: PushMessage,
  ): Promise<void> {
    if (tokens.length === 0) return;

    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const messages = batch.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default',
      }));
      try {
        const res = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(this.accessToken
              ? { Authorization: `Bearer ${this.accessToken}` }
              : {}),
          },
          body: JSON.stringify(messages),
        });
        if (!res.ok) {
          this.logger.error(
            `Expo push failed: ${res.status} ${await res.text()}`,
          );
          continue;
        }
        const json = (await res.json()) as {
          data?: { status: string; details?: { error?: string } }[];
        };
        await this.reconcile(batch, json.data ?? []);
      } catch (e) {
        this.logger.error(
          `Expo push error: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /** Clear tokens Expo reports as no longer registered. */
  private async reconcile(
    tokens: string[],
    tickets: { status: string; details?: { error?: string } }[],
  ): Promise<void> {
    const dead: string[] = [];
    tickets.forEach((ticket, idx) => {
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        dead.push(tokens[idx]);
      }
    });
    if (dead.length > 0) {
      await this.prisma.user.updateMany({
        where: { pushToken: { in: dead } },
        data: { pushToken: null },
      });
      this.logger.log(`Cleared ${dead.length} unregistered push token(s)`);
    }
  }
}
