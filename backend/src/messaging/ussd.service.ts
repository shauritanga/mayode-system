import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipsService } from '../memberships/memberships.service';
import { FarmLeasesService } from '../farm-leases/farm-leases.service';
import { FarmRegistryService } from '../farm-registry/farm-registry.service';
import { normalizeMsisdn } from './sms.service';

export interface UssdRequest {
  sessionId: string;
  phoneNumber: string;
  text: string; // accumulated inputs joined by '*'
}

/**
 * USSD menu handler (Africa's Talking convention): each response is plain text
 * prefixed with `CON ` (session continues, awaiting input) or `END ` (session
 * terminates). `text` accumulates the user's inputs across the session joined
 * by `*`, so the current step is derived from splitting it.
 *
 * Menu:
 *   (root)        1 My leases  2 Confirm farm ownership  3 Membership  4 Help
 *   1             list pending leases → pick one
 *   1*<n>         1 Confirm  2 Reject
 *   2             list pending ownership confirmations → pick one
 *   2*<n>         1 Confirm  2 Reject
 */
@Injectable()
export class UssdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly leases: FarmLeasesService,
    private readonly registry: FarmRegistryService,
  ) {}

  async handle(req: UssdRequest): Promise<string> {
    const phone = normalizeMsisdn(req.phoneNumber);
    const parts = (req.text ?? '').split('*').filter((s) => s !== '');

    // Root menu
    if (parts.length === 0) {
      return con(
        'Welcome to MAYOData\n1. My leases\n2. Confirm farm ownership\n3. Membership\n4. Help',
      );
    }

    // 1 — Leases
    if (parts[0] === '1') {
      const pending = await this.leases.pendingLeasesByPhone(phone);

      if (parts.length === 1) {
        if (pending.length === 0) {
          return end('You have no leases awaiting confirmation.');
        }
        const lines = pending
          .slice(0, 5)
          .map(
            (l, i) => `${i + 1}. ${l.farm.farmCode} (${l.farmingSeason.name})`,
          )
          .join('\n');
        return con(`Pending leases:\n${lines}`);
      }

      // 1*<n> — a specific lease chosen
      const idx = Number(parts[1]) - 1;
      const lease = pending[idx];
      if (!lease) return end('Invalid selection.');

      if (parts.length === 2) {
        return con(
          `Farm ${lease.farm.farmCode}\nSeason ${lease.farmingSeason.name}\n1. Confirm\n2. Reject`,
        );
      }

      // 1*<n>*<action>
      if (parts[2] === '1') {
        const r = await this.leases.confirmLeaseByPhone(phone);
        return end(
          r.ok
            ? `Confirmed. You are the active farmer for ${r.farmCode} (${r.season}).`
            : (r.message ?? 'No pending lease found.'),
        );
      }
      if (parts[2] === '2') {
        const r = await this.leases.rejectLeaseByPhone(phone);
        return end(
          r.ok
            ? `Rejected. The owner of ${r.farmCode} has been notified.`
            : (r.message ?? 'No pending lease found.'),
        );
      }
      return end('Invalid selection.');
    }

    // 2 — Confirm farm ownership (AMCOS pre-registration)
    if (parts[0] === '2') {
      const pending = await this.registry.pendingByPhone(phone);

      if (parts.length === 1) {
        if (pending.length === 0) {
          return end('You have no farm-ownership confirmations pending.');
        }
        const lines = pending
          .slice(0, 5)
          .map(
            (r, i) => `${i + 1}. ${r.name ?? 'Farm'} (${r.plotNumber ?? '—'})`,
          )
          .join('\n');
        return con(`Pending farms:\n${lines}`);
      }

      const idx = Number(parts[1]) - 1;
      const record = pending[idx];
      if (!record) return end('Invalid selection.');

      if (parts.length === 2) {
        return con(
          `${record.name}\n1. Confirm — this is my farm\n2. Reject — not mine`,
        );
      }

      if (parts[2] === '1') {
        const r = await this.registry.confirmByPhone(phone);
        return end(
          r.ok
            ? `Confirmed. Thank you for confirming "${r.name}".`
            : (r.message ?? 'No pending farm found.'),
        );
      }
      if (parts[2] === '2') {
        const r = await this.registry.rejectByPhone(phone);
        return end(
          r.ok
            ? `Recorded. A MAYODE officer will review "${r.name}".`
            : (r.message ?? 'No pending farm found.'),
        );
      }
      return end('Invalid selection.');
    }

    // 3 — Membership
    if (parts[0] === '3') {
      const user = await this.prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (!user) {
        return end(
          'No MAYOData account found for this number. Register in the app to subscribe.',
        );
      }
      const active = await this.memberships.hasActiveMembership(user.id);
      return end(
        active
          ? 'Your MAYOData membership is active. Premium analytics are unlocked.'
          : 'You are on a free account. Open the MAYOData app to activate membership and unlock analytics.',
      );
    }

    // 4 — Help
    if (parts[0] === '4') {
      return end('MAYOData support: support@mayodegroup.com');
    }

    return end('Invalid choice.');
  }
}

function con(body: string): string {
  return `CON ${body}`;
}
function end(body: string): string {
  return `END ${body}`;
}
