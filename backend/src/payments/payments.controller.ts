import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipsService } from '../memberships/memberships.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { SalesService } from '../sales/sales.service';

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

  constructor(
    private readonly memberships: MembershipsService,
    private readonly marketplace: MarketplaceService,
    private readonly sales: SalesService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'ClickPesa payment webhook (public; status is re-verified server-side)',
  })
  async webhook(@Body() body: ClickPesaWebhookBody) {
    const orderReference = body?.data?.orderReference;
    this.logger.log(
      `ClickPesa webhook: event=${body?.event} orderReference=${orderReference} status=${body?.data?.status}`,
    );
    if (orderReference) {
      // orderReference is unique per source table, so at most one of these
      // finds a match — a NotFoundException from the other is expected, not
      // an error. Never let one failure block the other.
      let matched = false;
      try {
        await this.memberships.reconcilePayment(orderReference);
        matched = true;
      } catch (e) {
        this.logger.debug(`Not a membership order: ${orderReference}`);
      }
      try {
        await this.marketplace.reconcileEscrowPayment(orderReference);
        matched = true;
      } catch (e) {
        this.logger.debug(`Not a marketplace escrow order: ${orderReference}`);
      }
      try {
        await this.sales.reconcileBuyerPayment(orderReference);
        matched = true;
      } catch (e) {
        this.logger.debug(`Not a cooperative sale order: ${orderReference}`);
      }
      if (!matched) {
        this.logger.error(
          `ClickPesa webhook: no record found for order ${orderReference}`,
        );
      }
    }
    // Always acknowledge so ClickPesa stops retrying.
    return { received: true };
  }
}
