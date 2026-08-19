import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FarmLeasesService } from '../farm-leases/farm-leases.service';
import { FarmRegistryService } from '../farm-registry/farm-registry.service';
import { SmsService } from './sms.service';
import { UssdService } from './ussd.service';
import { WebhookSecretGuard } from './webhook-secret.guard';

interface InboundSmsBody {
  from?: string;
  text?: string;
}

interface UssdBody {
  sessionId?: string;
  phoneNumber?: string;
  text?: string;
  serviceCode?: string;
}

/**
 * Feature-phone endpoints (public — the SMS/USSD aggregator posts here).
 * Africa's Talking sends application/x-www-form-urlencoded, which Nest parses
 * into the body object.
 */
@ApiTags('messaging')
@Controller('messaging')
export class MessagingController {
  private readonly logger = new Logger(MessagingController.name);

  constructor(
    private readonly leases: FarmLeasesService,
    private readonly registry: FarmRegistryService,
    private readonly sms: SmsService,
    private readonly ussd: UssdService,
  ) {}

  /**
   * A phone number may have a pending lease confirmation, a pending
   * ownership confirmation, or both — a lease reply takes priority since it
   * is the more time-sensitive of the two (owner comment §10).
   */
  @Post('sms/inbound')
  @UseGuards(WebhookSecretGuard)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Inbound SMS webhook — YES/NO replies confirm a lease or farm-ownership request',
  })
  async inboundSms(@Body() body: InboundSmsBody) {
    const from = body?.from?.trim();
    const text = (body?.text ?? '').trim().toLowerCase();
    this.logger.log(`Inbound SMS from ${from}: "${text}"`);
    if (!from) return { received: true };

    const yes = ['1', 'yes', 'y', 'ndio', 'ndiyo'].includes(text);
    const no = ['2', 'no', 'n', 'hapana'].includes(text);
    if (!yes && !no) {
      await this.sms.send(
        from,
        'MAYOData: Reply 1 to confirm or 2 to reject your pending farm lease or ownership request.',
        'help',
      );
      return { received: true };
    }

    try {
      const pendingLeases = await this.leases.pendingLeasesByPhone(from);
      if (pendingLeases.length > 0) {
        if (yes) {
          const r = await this.leases.confirmLeaseByPhone(from);
          await this.sms.send(
            from,
            r.ok
              ? `MAYOData: Confirmed. You are the active farmer for ${r.farmCode} (${r.season}).`
              : 'MAYOData: No pending lease found for this number.',
            'lease_outcome',
          );
        } else {
          const r = await this.leases.rejectLeaseByPhone(from);
          await this.sms.send(
            from,
            r.ok
              ? `MAYOData: You rejected the lease for ${r.farmCode}. The owner has been notified.`
              : 'MAYOData: No pending lease found for this number.',
            'lease_outcome',
          );
        }
        return { received: true };
      }

      const pendingRegistry = await this.registry.pendingByPhone(from);
      if (pendingRegistry.length > 0) {
        if (yes) {
          const r = await this.registry.confirmByPhone(from);
          await this.sms.send(
            from,
            r.ok
              ? `MAYOData: Thank you. You confirmed farm "${r.name}".`
              : 'MAYOData: No pending farm confirmation found for this number.',
            'registry_outcome',
          );
        } else {
          const r = await this.registry.rejectByPhone(from);
          await this.sms.send(
            from,
            r.ok
              ? `MAYOData: Recorded. A MAYODE officer will review farm "${r.name}".`
              : 'MAYOData: No pending farm confirmation found for this number.',
            'registry_outcome',
          );
        }
        return { received: true };
      }

      await this.sms.send(
        from,
        'MAYOData: You have no pending confirmations right now.',
        'help',
      );
    } catch (e) {
      this.logger.error(
        `Inbound SMS handling failed: ${e instanceof Error ? e.message : e}`,
      );
    }
    return { received: true };
  }

  @Post('ussd')
  @UseGuards(WebhookSecretGuard)
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  @ApiOperation({
    summary:
      "USSD webhook — returns CON/END menu text (Africa's Talking convention)",
  })
  async ussdHandler(@Body() body: UssdBody): Promise<string> {
    try {
      return await this.ussd.handle({
        sessionId: body?.sessionId ?? '',
        phoneNumber: body?.phoneNumber ?? '',
        text: body?.text ?? '',
      });
    } catch (e) {
      this.logger.error(
        `USSD handling failed: ${e instanceof Error ? e.message : e}`,
      );
      return 'END Sorry, something went wrong. Please try again later.';
    }
  }
}
