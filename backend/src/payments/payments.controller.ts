import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipsService } from '../memberships/memberships.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { SalesService } from '../sales/sales.service';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { UserRole } from '@prisma/client';

interface ClickPesaWebhookBody {
  event?: string; // "PAYMENT RECEIVED" | "PAYMENT FAILED"
  data?: {
    orderReference?: string;
    status?: string;
    paymentReference?: string;
  };
}

/**
 * ClickPesa webhook receiver & Farmer payments ledger.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly memberships: MembershipsService,
    private readonly marketplace: MarketplaceService,
    private readonly sales: SalesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('mine')
  @RequirePermission('finance', 'VIEW')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FARMER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get unified payments and transactions ledger for the logged-in farmer',
  })
  findMyPayments(@CurrentUser() user: RequestUser) {
    return this.paymentsService.findMyPayments(user);
  }

  @Post('clickpesa/webhook')
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
