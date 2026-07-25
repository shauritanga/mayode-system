import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FarmLeasesService } from '../farm-leases/farm-leases.service';
import { SmsService } from './sms.service';
import { UssdService } from './ussd.service';

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
    private readonly sms: SmsService,
    private readonly ussd: UssdService,
  ) {}

  @Post('sms/inbound')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inbound SMS webhook — a renter replies 1/YES or 2/NO to confirm a lease' })
  async inboundSms(@Body() body: InboundSmsBody) {
    const from = body?.from?.trim();
    const text = (body?.text ?? '').trim().toLowerCase();
    this.logger.log(`Inbound SMS from ${from}: "${text}"`);
    if (!from) return { received: true };

    const yes = ['1', 'yes', 'y', 'ndio', 'ndiyo'].includes(text);
    const no = ['2', 'no', 'n', 'hapana'].includes(text);

    try {
      if (yes) {
        const r = await this.leases.confirmLeaseByPhone(from);
        await this.sms.send(
          from,
          r.ok
            ? `MAYOData: Confirmed. You are the active farmer for ${r.farmCode} (${r.season}).`
            : 'MAYOData: No pending lease found for this number.',
          'lease_outcome',
        );
      } else if (no) {
        const r = await this.leases.rejectLeaseByPhone(from);
        await this.sms.send(
          from,
          r.ok
            ? `MAYOData: You rejected the lease for ${r.farmCode}. The owner has been notified.`
            : 'MAYOData: No pending lease found for this number.',
          'lease_outcome',
        );
      } else {
        await this.sms.send(
          from,
          'MAYOData: Reply 1 to confirm or 2 to reject your pending farm lease.',
          'lease_help',
        );
      }
    } catch (e) {
      this.logger.error(`Inbound SMS handling failed: ${e instanceof Error ? e.message : e}`);
    }
    return { received: true };
  }

  @Post('ussd')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'USSD webhook — returns CON/END menu text (Africa\'s Talking convention)' })
  async ussdHandler(@Body() body: UssdBody): Promise<string> {
    try {
      return await this.ussd.handle({
        sessionId: body?.sessionId ?? '',
        phoneNumber: body?.phoneNumber ?? '',
        text: body?.text ?? '',
      });
    } catch (e) {
      this.logger.error(`USSD handling failed: ${e instanceof Error ? e.message : e}`);
      return 'END Sorry, something went wrong. Please try again later.';
    }
  }
}
