import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { SalesService } from '../sales/sales.service';
import { BuyerOrdersService } from '../buyer-orders/buyer-orders.service';
import { BuyersService } from '../buyers/buyers.service';

type PortalUser = {
  id: string;
  role: UserRole | string;
  phone?: string | null;
  email?: string | null;
};

@Injectable()
export class BuyerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly sales: SalesService,
    private readonly buyerOrders: BuyerOrdersService,
    private readonly buyers: BuyersService,
  ) {}

  profile() {
    return {
      name: 'MAYODE Youth Development Group',
      location: 'Mbarali, Mbeya, Tanzania',
      focus:
        'Rice production, traceability, and Fairtrade cooperative development',
    };
  }

  me(user: PortalUser) {
    return this.buyers.resolveForUser(user).then((company) => ({
      matched: Boolean(company),
      company,
      hint: company
        ? null
        : 'No buyer company matched your account phone/email. Ask an admin to set the buyer contact phone or email to match your login.',
    }));
  }

  async dashboard(user: PortalUser) {
    const cooperative = await this.reports.kpis();
    const isBuyer = user.role === UserRole.BUYER;
    const company = isBuyer ? await this.buyers.resolveForUser(user) : null;

    if (!isBuyer) {
      return {
        scope: 'cooperative',
        matched: false,
        company: null,
        cooperative,
        metrics: null,
        recentSales: [],
        orders: [],
      };
    }

    if (!company) {
      return {
        scope: 'buyer',
        matched: false,
        company: null,
        cooperative,
        metrics: null,
        recentSales: [],
        orders: [],
        hint: 'Link your login phone or email to a buyer company contact to see your orders and purchases.',
      };
    }

    const [orders, sales] = await Promise.all([
      this.prisma.buyerOrder.findMany({
        where: { buyerId: company.id },
        include: {
          sales: {
            select: {
              id: true,
              invoiceNumber: true,
              quantityKg: true,
              saleDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.findMany({
        where: { buyerId: company.id },
        include: {
          lot: { select: { lotNumber: true, totalWeightKg: true } },
        },
        orderBy: { saleDate: 'desc' },
        take: 25,
      }),
    ]);

    const totalPurchasedKg = sales.reduce((sum, s) => sum + s.quantityKg, 0);
    const totalSpend = sales.reduce((sum, s) => sum + s.totalRevenue, 0);

    return {
      scope: 'buyer',
      matched: true,
      company: {
        id: company.id,
        name: company.name,
        isCertified: company.isCertified,
        contactPerson: company.contactPerson,
      },
      cooperative,
      metrics: {
        openOrders: orders.filter((o) => o.status === 'OPEN').length,
        totalOrders: orders.length,
        salesCount: sales.length,
        totalPurchasedKg,
        totalSpend,
      },
      recentSales: sales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: sale.saleDate,
        quantityKg: sale.quantityKg,
        totalRevenue: sale.totalRevenue,
        paymentReceived: sale.paymentReceived,
        lotNumber: sale.lot?.lotNumber,
      })),
      orders,
    };
  }

  async createOrder(
    user: PortalUser,
    dto: {
      riceVariety?: string;
      quantityRequiredKg: number;
      qualityRequirements?: string;
      requiredByDate?: string;
      notes?: string;
    },
  ) {
    const company = await this.buyers.requireMatchedBuyer(user);
    return this.buyerOrders.create({
      buyerId: company.id,
      riceVariety: dto.riceVariety,
      quantityRequiredKg: dto.quantityRequiredKg,
      qualityRequirements: dto.qualityRequirements,
      requiredByDate: dto.requiredByDate,
      notes: dto.notes,
    });
  }

  async traceability(reference: string, user: PortalUser) {
    const trace = await this.sales.traceability(reference);
    if (!trace.invoiceNumber || !trace.lot || !trace.buyer) {
      throw new NotFoundException(
        `No completed sale was found for traceability reference ${reference}`,
      );
    }

    if (user.role === UserRole.BUYER) {
      const company = await this.buyers.resolveForUser(user);
      if (company && (trace.buyer as { id?: string }).id && company.id !== (trace.buyer as { id: string }).id) {
        throw new ForbiddenException(
          'That sale belongs to a different buyer company.',
        );
      }
    }

    return {
      invoiceNumber: trace.invoiceNumber,
      saleDate: trace.saleDate,
      paymentReceived: trace.paymentReceived,
      buyer: trace.buyer,
      lot: trace.lot
        ? {
            lotNumber: trace.lot.lotNumber,
            riceVariety: trace.lot.riceVariety,
            totalWeightKg: trace.lot.totalWeightKg,
            sorterQuality: (trace.lot as any).sorterQuality ?? null,
          }
        : null,
      // Buyer view intentionally omits names, phone numbers and precise farmer locations.
      sourceRecords: trace.sourceRecords.map((record) => ({
        trackingCode: record.trackingCode,
        receivedDate: record.receivedDate,
        weightKg: record.weightKg,
        qualityGrade: record.qualityGrade,
        farmCode: record.farm?.farmCode,
        district: record.farm?.district,
        region: record.farm?.region,
      })),
    };
  }
}
