import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MembershipStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClickPesaService } from '../payments/clickpesa.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AllocationService } from '../irrigation/allocation.service';
import { farmIdDisplay } from '../irrigation/irrigation-codes';
import type { RequestUser } from '../common/ownership.service';
import { CreateFarmSaleDto } from './dto/farm-sales.dto';

/** Premium members hear about a new farm at once; everyone else this long after. */
const NON_PREMIUM_DELAY_MS = 3 * 3600_000;
const PAID_STATUSES = ['SUCCESS', 'SETTLED'];
const ACTIVE_MEMBERSHIP: MembershipStatus[] = ['ACTIVE', 'WAIVED', 'SPONSORED'] as MembershipStatus[];
const DEFAULT_FEE_TZS = 20000;
const name = (f: { firstName: string; lastName: string }) => `${f.firstName} ${f.lastName}`;

@Injectable()
export class FarmSalesService {
  private readonly logger = new Logger(FarmSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickPesa: ClickPesaService,
    private readonly memberships: MembershipsService,
    private readonly notifications: NotificationsService,
    private readonly allocations: AllocationService,
  ) {}

  private async me(user: RequestUser) {
    const f = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true, mamcosId: true, firstName: true, lastName: true, user: { select: { phone: true } } } });
    if (!f || !f.mamcosId) throw new ForbiddenException('Only AMCOS members can use farm sales');
    return f as typeof f & { mamcosId: string };
  }

  async feeAmount(): Promise<number> {
    const s = await this.prisma.orgSettings.findFirst({ select: { farmSaleListingFeeTzs: true } });
    return s?.farmSaleListingFeeTzs ?? DEFAULT_FEE_TZS;
  }

  private orderReference() {
    return `FSL${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toUpperCase();
  }

  /** Charges the listing fee to `payer`'s phone and records the pending fee. */
  private async startFee(listingId: string, payer: { id: string; user: { phone: string | null } | null }, amount: number, phoneNumber?: string) {
    if (!this.clickPesa.isConfigured()) throw new BadRequestException('Mobile-money payment is not available right now. Please try again later');
    const phone = phoneNumber?.trim() || payer.user?.phone || '';
    if (!phone || phone.startsWith('+999')) throw new BadRequestException('Enter the mobile-money phone number to pay with');
    const orderReference = this.orderReference();
    await this.prisma.farmSaleFee.create({ data: { listingId, payerFarmerId: payer.id, amount, orderReference } });
    try {
      await this.clickPesa.initiateUssdPush({ amount: String(amount), orderReference, phoneNumber: phone });
    } catch (e) {
      throw new BadRequestException(`Could not start mobile-money payment: ${e instanceof Error ? e.message : e}`);
    }
    return { orderReference, amount, message: 'Check your phone and enter your mobile-money PIN to pay the listing fee.' };
  }

  // ───────────────────────── seller ─────────────────────────

  async create(user: RequestUser, dto: CreateFarmSaleDto) {
    const me = await this.me(user);
    const alloc = await this.prisma.irrigationHectareAllocation.findFirst({
      where: { hectareId: dto.hectareId, status: 'ACTIVE', farmerId: me.id, hectare: { block: { canal: { scheme: { mamcosId: me.mamcosId } } } } },
      select: { id: true },
    });
    if (!alloc) throw new ForbiddenException('You can only sell a farm that is registered to you');
    const busy = await this.prisma.farmSaleListing.count({ where: { hectareId: dto.hectareId, status: { in: ['PENDING_FEE', 'OPEN'] } } });
    if (busy) throw new ConflictException('This farm is already listed for sale');
    const openTransfer = await this.prisma.irrigationAllocationTransfer.count({
      where: { hectareId: dto.hectareId, status: { in: ['BUYER_REQUESTED', 'AWAITING_CODE', 'AWAITING_RECIPIENT', 'PENDING_APPROVAL'] } },
    });
    if (openTransfer) throw new ConflictException('A transfer is already in progress for this farm');
    const feeAmount = await this.feeAmount();
    const listing = await this.prisma.farmSaleListing.create({
      data: {
        mamcosId: me.mamcosId, hectareId: dto.hectareId, sellerId: me.id, askingPrice: dto.askingPrice, description: dto.description?.trim() || null,
        feePaidBy: dto.feePaidBy, feeAmount, status: dto.feePaidBy === 'SELLER' ? 'PENDING_FEE' : 'OPEN',
        publishedAt: dto.feePaidBy === 'SELLER' ? null : new Date(),
      },
    });
    if (dto.feePaidBy === 'BUYER') {
      await this.announce(listing.id);
      return { listing, payment: null };
    }
    try {
      return { listing, payment: await this.startFee(listing.id, me, feeAmount, dto.phoneNumber) };
    } catch (e) {
      // keep the unpaid listing so the seller can retry from the app
      this.logger.warn(`Listing fee not started: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /** The seller (re)starts payment of the listing fee. */
  async payFee(user: RequestUser, id: string, phoneNumber?: string) {
    const me = await this.me(user);
    const l = await this.prisma.farmSaleListing.findFirst({ where: { id, sellerId: me.id } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.feePaidBy !== 'SELLER' || l.status !== 'PENDING_FEE') throw new ConflictException('There is no fee for you to pay on this listing');
    return this.startFee(l.id, me, l.feeAmount, phoneNumber);
  }

  async withdraw(user: RequestUser, id: string) {
    const me = await this.me(user);
    const l = await this.prisma.farmSaleListing.findFirst({ where: { id, sellerId: me.id } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.status !== 'OPEN' && l.status !== 'PENDING_FEE') throw new ConflictException('This listing can no longer be withdrawn');
    const open = await this.prisma.irrigationAllocationTransfer.count({
      where: { saleListingId: id, status: { in: ['BUYER_REQUESTED', 'AWAITING_CODE', 'PENDING_APPROVAL'] } },
    });
    if (open) throw new ConflictException('A buyer has already asked for this farm. Ask the AMCOS to close the transfer first');
    return this.prisma.farmSaleListing.update({ where: { id }, data: { status: 'WITHDRAWN' } });
  }

  // ───────────────────────── buyer ─────────────────────────

  /**
   * The buyer asks to buy. When the buyer pays the listing fee, this first charges it (and the request is made once it is
   * paid); otherwise the request goes to the AMCOS straight away.
   */
  async buy(user: RequestUser, id: string, phoneNumber?: string) {
    const me = await this.me(user);
    const l = await this.prisma.farmSaleListing.findFirst({ where: { id, mamcosId: me.mamcosId } });
    if (!l || l.status !== 'OPEN') throw new NotFoundException('This farm is not for sale');
    if (l.sellerId === me.id) throw new BadRequestException('You cannot buy your own farm');
    if (l.feePaidBy === 'BUYER') {
      const paid = await this.prisma.farmSaleFee.count({ where: { listingId: id, payerFarmerId: me.id, status: 'PAID' } });
      if (!paid) return { transfer: null, payment: await this.startFee(id, me, l.feeAmount, phoneNumber) };
    }
    return { transfer: await this.allocations.requestPurchase(user, id), payment: null };
  }

  // ───────────────────────── fee reconciliation ─────────────────────────

  /** Webhook / poll: re-check the payment with ClickPesa, then publish the listing or release the buyer's request. */
  async reconcileFee(orderReference: string) {
    const fee = await this.prisma.farmSaleFee.findUnique({ where: { orderReference }, include: { listing: true, payer: { select: { userId: true } } } });
    if (!fee) throw new NotFoundException(`No farm sale fee for order ${orderReference}`);
    if (fee.status === 'PAID') return { status: 'PAID' as const, transferred: false };
    const payment = this.clickPesa.isConfigured() ? await this.clickPesa.queryPayment(orderReference) : null;
    if (payment && PAID_STATUSES.includes(payment.status)) {
      const claimed = await this.prisma.farmSaleFee.updateMany({ where: { id: fee.id, status: { not: 'PAID' } }, data: { status: 'PAID', paidAt: new Date() } });
      if (!claimed.count) return { status: 'PAID' as const, transferred: false };
      if (fee.listing.feePaidBy === 'SELLER' && fee.listing.status === 'PENDING_FEE') {
        await this.prisma.farmSaleListing.update({ where: { id: fee.listingId }, data: { status: 'OPEN', publishedAt: new Date() } });
        await this.announce(fee.listingId);
        return { status: 'PAID' as const, transferred: false };
      }
      if (fee.listing.feePaidBy === 'BUYER' && fee.payer.userId) {
        try {
          await this.allocations.requestPurchase({ id: fee.payer.userId, role: UserRole.FARMER } as RequestUser, fee.listingId);
          return { status: 'PAID' as const, transferred: true };
        } catch (e) {
          // the fee stays paid; the buyer can ask again without paying twice
          this.logger.warn(`Buyer paid but the request was refused: ${e instanceof Error ? e.message : e}`);
        }
      }
      return { status: 'PAID' as const, transferred: false };
    }
    if (payment && payment.status === 'FAILED') {
      await this.prisma.farmSaleFee.update({ where: { id: fee.id }, data: { status: 'FAILED' } });
      return { status: 'FAILED' as const, transferred: false };
    }
    return { status: 'PENDING' as const, transferred: false };
  }

  /** App poll: re-check this user's latest pending fee on a listing. */
  async reconcileMine(user: RequestUser, listingId: string) {
    const me = await this.me(user);
    const fee = await this.prisma.farmSaleFee.findFirst({ where: { listingId, payerFarmerId: me.id }, orderBy: { createdAt: 'desc' } });
    if (!fee) return { status: null, transferred: false };
    return this.reconcileFee(fee.orderReference);
  }

  // ───────────────────────── viewing ─────────────────────────

  private async premiumIds(userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const rows = await this.prisma.membership.findMany({
      where: { userId: { in: userIds }, status: { in: ACTIVE_MEMBERSHIP }, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  private include = {
    hectare: { select: { id: true, code: true, areaHectares: true, block: { select: { code: true, canal: { select: { code: true } } } } } },
    seller: { select: { id: true, userId: true, firstName: true, lastName: true, controlNumber: true, village: true, ward: true, district: true, user: { select: { phone: true } } } },
  } as const;

  /** Basic details for everyone; the seller's identity and contact, and the exact place, only for premium members and the seller. */
  private shape(l: any, full: boolean, mine: boolean) {
    const base = {
      id: l.id, status: l.status, askingPrice: Number(l.askingPrice), description: l.description, publishedAt: l.publishedAt,
      feePaidBy: l.feePaidBy, feeAmount: l.feeAmount, mine,
      farmId: farmIdDisplay(l.hectare.code), areaHectares: Number(l.hectare.areaHectares),
      village: l.seller.village ?? l.seller.ward ?? l.seller.district ?? null,
      detailsLocked: !full,
    };
    if (!full) return base;
    return {
      ...base,
      block: l.hectare.block.code, canal: l.hectare.block.canal.code,
      seller: { id: l.seller.id, name: name(l.seller), memberNumber: l.seller.controlNumber, phone: l.seller.user?.phone ?? null, ward: l.seller.ward, district: l.seller.district },
    };
  }

  async list(user: RequestUser) {
    const tenant = user.role === UserRole.FARMER ? (await this.me(user)).mamcosId : (user.mamcosId ?? null);
    const me = user.role === UserRole.FARMER ? await this.me(user) : null;
    const rows = await this.prisma.farmSaleListing.findMany({
      where: { status: 'OPEN', ...(tenant ? { mamcosId: tenant } : {}) }, orderBy: { publishedAt: 'desc' }, include: this.include,
    });
    const premium = await this.memberships.hasPremiumAccess(user);
    return rows.map((l) => this.shape(l, premium || l.sellerId === me?.id, l.sellerId === me?.id));
  }

  async mine(user: RequestUser) {
    const me = await this.me(user);
    const rows = await this.prisma.farmSaleListing.findMany({ where: { sellerId: me.id }, orderBy: { createdAt: 'desc' }, include: this.include });
    return rows.map((l) => this.shape(l, true, true));
  }

  async get(user: RequestUser, id: string) {
    const me = user.role === UserRole.FARMER ? await this.me(user) : null;
    const l = await this.prisma.farmSaleListing.findUnique({ where: { id }, include: this.include });
    const tenant = me?.mamcosId ?? user.mamcosId ?? null;
    if (!l || (tenant && l.mamcosId !== tenant)) throw new NotFoundException('Listing not found');
    const isSeller = l.sellerId === me?.id;
    if (l.status !== 'OPEN' && !isSeller && user.role === UserRole.FARMER) throw new NotFoundException('Listing not found');
    const premium = await this.memberships.hasPremiumAccess(user);
    return this.shape(l, premium || isSeller, isSeller);
  }

  // ───────────────────────── alerts ─────────────────────────

  /** A farm just went on sale: premium members are told now, the other members of the AMCOS three hours later. */
  private async announce(listingId: string) {
    try {
      const l = await this.prisma.farmSaleListing.findUnique({ where: { id: listingId }, include: { hectare: { select: { code: true, areaHectares: true } }, seller: { select: { userId: true } } } });
      if (!l) return;
      const members = await this.prisma.farmer.findMany({ where: { mamcosId: l.mamcosId, userId: { not: l.seller.userId } }, select: { userId: true } });
      const userIds = members.map((m) => m.userId).filter((x): x is string => !!x);
      const premium = await this.premiumIds(userIds);
      const now = new Date();
      const later = new Date(now.getTime() + NON_PREMIUM_DELAY_MS);
      await this.prisma.farmSaleNotification.createMany({
        data: userIds.map((userId) => ({ listingId, userId, sendAt: premium.has(userId) ? now : later, sentAt: premium.has(userId) ? now : null })),
        skipDuplicates: true,
      });
      for (const userId of userIds.filter((u) => premium.has(u))) await this.sendAlert(userId, l);
    } catch (e) {
      this.logger.warn(`Could not announce farm sale ${listingId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async sendAlert(userId: string, l: { id: string; askingPrice: unknown; hectare: { code: string; areaHectares: unknown } }) {
    await this.notifications.create({
      userId, type: 'farm_sale.new', title: 'New farm for sale',
      body: `Farm ${farmIdDisplay(l.hectare.code)} (${Number(l.hectare.areaHectares)} ha) is for sale for TZS ${Number(l.askingPrice).toLocaleString('en-US')}.`,
      data: { listingId: l.id },
    });
  }

  /** Sends the delayed alerts that are due. Stored in the database, so a restart loses nothing. */
  @Cron('*/5 * * * *', { name: 'farm-sale-alerts' })
  async sendDueAlerts(): Promise<number> {
    try {
      const due = await this.prisma.farmSaleNotification.findMany({
        where: { sentAt: null, sendAt: { lte: new Date() } }, take: 500, orderBy: { sendAt: 'asc' },
        include: { listing: { include: { hectare: { select: { code: true, areaHectares: true } } } } },
      });
      let sent = 0;
      for (const n of due) {
        const claimed = await this.prisma.farmSaleNotification.updateMany({ where: { id: n.id, sentAt: null }, data: { sentAt: new Date() } });
        if (!claimed.count) continue;
        if (n.listing.status !== 'OPEN') continue;
        await this.sendAlert(n.userId, n.listing);
        sent++;
      }
      return sent;
    } catch (e) {
      this.logger.error(`Farm sale alerts failed: ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }
}
