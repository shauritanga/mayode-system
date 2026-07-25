import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipsService } from '../memberships/memberships.service';

interface ClickPesaWebhookBody {
  event?: string; // "PAYMENT RECEIVED" | "PAYMENT FAILED"
  data?: {
    orderReference?: string;
    status?: string;
    paymentReference?: string;
  };
}

/**
 * ClickPesa webhook receiver. Public (no JWT) — ClickPesa posts here. The body
 * is NOT trusted for activation: we take only the orderReference and re-query
 * ClickPesa server-side for the authoritative status before doing anything.
 */
@ApiTags('payments')
@Controller('payments/clickpesa')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly memberships: MembershipsService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'ClickPesa payment webhook (public; status is re-verified server-side)' })
  async webhook(@Body() body: ClickPesaWebhookBody) {
    const orderReference = body?.data?.orderReference;
    this.logger.log(
      `ClickPesa webhook: event=${body?.event} orderReference=${orderReference} status=${body?.data?.status}`,
    );
    if (orderReference) {
      try {
        await this.memberships.reconcilePayment(orderReference);
      } catch (e) {
        // Never fail the webhook — ClickPesa retries on non-2xx. Log and move on;
        // the mobile poll / manual reconcile can recover.
        this.logger.error(
          `Failed to reconcile ${orderReference}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    // Always acknowledge so ClickPesa stops retrying.
    return { received: true };
  }
}
