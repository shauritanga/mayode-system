import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Shared-secret check for the Africa's Talking webhooks. When
 * MESSAGING_WEBHOOK_SECRET is unset the guard stays permissive so existing
 * aggregator integrations keep working, and warns once per instance.
 */
@Injectable()
export class WebhookSecretGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSecretGuard.name);
  private warned = false;

  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.MESSAGING_WEBHOOK_SECRET;
    if (!secret) {
      if (!this.warned) {
        this.logger.warn(
          'MESSAGING_WEBHOOK_SECRET is not set — messaging webhooks are unauthenticated',
        );
        this.warned = true;
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    const provided =
      request.headers['x-webhook-secret'] ?? request.query?.secret;
    if (provided !== secret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return true;
  }
}
