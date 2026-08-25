import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  PaymentType,
  Prisma,
  RevenueType,
} from '@prisma/client';
import { ActivitiesService } from '../activities/activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/sales.dto';
import { CreateDispatchDto } from './dto/dispatch.dto';
import { LoansService } from '../loans/loans.service';
import { AccountingService } from '../accounting/accounting.service';
import { apportionSale } from './allocation';
import { ClickPesaService } from '../payments/clickpesa.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
    private readonly loans: LoansService,
    private readonly accounting: AccountingService,
    private readonly clickPesa: ClickPesaService,
  ) {}

  private async nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const latest = await this.prisma.sale.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const sequence = latest
      ? Number(latest.invoiceNumber.slice(prefix.length)) + 1
      : 1;
    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  /** Sorter / QR evidence attached to a lot for traceability. */
  private async lotAiQuality(lotId: string) {
    const sorterEvidence = await this.prisma.aiIntegrationRecord.findMany({
      where: {
        lotId,
        sourceType: { in: ['RICE_SORTER', 'QR_TRACEABILITY'] },
      },
      orderBy: { capturedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        sourceType: true,
        externalReference: true,
        payload: true,
        recommendation: true,
        capturedAt: true,
      },
    });
    const latestSorter = sorterEvidence.find((r) => r.sourceType === 'RICE_SORTER');
    const sorterRec =
      latestSorter?.recommendation &&
      typeof latestSorter.recommendation === 'object'
        ? (latestSorter.recommendation as Record<string, unknown>)
        : null;
    const sorterPayload =
      latestSorter?.payload && typeof latestSorter.payload === 'object'
        ? (latestSorter.payload as Record<string, unknown>)
        : null;
    return {
      sorterQuality: latestSorter
        ? {
            qualityGrade:
              sorterRec?.qualityGrade ?? sorterPayload?.qualityGrade ?? null,
            moisturePct:
              sorterRec?.moisturePct ?? sorterPayload?.moisturePct ?? null,
            summary: sorterRec?.summary ?? null,
            severity: sorterRec?.severity ?? null,
            recordId: latestSorter.id,
            capturedAt: latestSorter.capturedAt,
          }
        : null,
      aiEvents: sorterEvidence,
    };
  }

  async create(dto: CreateSaleDto) {
    const [lot, buyer] = await Promise.all([
      this.prisma.lot.findUnique({
        where: { id: dto.lotId },
        include: {
          inventoryRecords: { include: { farmer: true, farm: true } },
        },
      }),
      this.prisma.buyer.findUnique({ where: { id: dto.buyerId } }),
    ]);
    if (!lot) throw new NotFoundException(`Lot with ID ${dto.lotId} not found`);
    if (!buyer)
      throw new NotFoundException(`Buyer with ID ${dto.buyerId} not found`);
    if (!lot.inventoryRecords.length)
      throw new BadRequestException(
        'A sale requires a lot with source inventory records',
      );
    if (dto.quantityKg > lot.totalWeightKg)
      throw new BadRequestException(
        'Sale quantity cannot exceed the lot weight',
      );

    const totalSourceWeight = lot.inventoryRecords.reduce(
      (total, record) => total + record.weightKg,
      0,
    );
    if (totalSourceWeight <= 0)
      throw new BadRequestException(
        'Lot source weight must be greater than zero',
      );

    const cycleByFarmer = new Map<string, string>();
    const validatedCycleIds = new Set<string>();
    for (const record of lot.inventoryRecords) {
      const cycle = await this.prisma.cropCycle.findFirst({
        where: record.cropCycleId
          ? {
              id: record.cropCycleId,
              farmId: record.farmId,
              farmerId: record.farmerId,
            }
          : { farmId: record.farmId, farmerId: record.farmerId },
        orderBy: [{ harvestDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
      });
      if (!cycle) {
        throw new BadRequestException(
          `No crop cycle exists for inventory record ${record.trackingCode}; create or link the crop cycle before sale.`,
        );
      }

      if (!validatedCycleIds.has(cycle.id)) {
        const [readiness, calendarTaskCount] = await Promise.all([
          this.prisma.harvestQualityCheck.findUnique({
            where: { cropCycleId: cycle.id },
          }),
          this.prisma.riceCalendarTask.count({
            where: { cropCycleId: cycle.id },
          }),
        ]);
        if (
          calendarTaskCount &&
          (!readiness?.warehouseReceivedAt ||
            readiness.dryingMoisturePct == null ||
            readiness.dryingMoisturePct > 14 ||
            !readiness.bagCount ||
            !readiness.bagWeightKg)
        ) {
          throw new BadRequestException(
            `Mbalari quality gate is incomplete for inventory record ${record.trackingCode}`,
          );
        }
        validatedCycleIds.add(cycle.id);
      }

      if (!cycleByFarmer.has(record.farmerId)) {
        cycleByFarmer.set(record.farmerId, cycle.id);
      }
    }

    const invoiceNumber = await this.nextInvoiceNumber();
    const gross = dto.quantityKg * dto.pricePerKg;
    const premium = dto.fairtradePremium ?? 0;
    const allocations = apportionSale(
      lot.inventoryRecords.map((record) => ({
        farmerId: record.farmerId,
        weightKg: record.weightKg,
      })),
      dto.quantityKg,
      gross,
      premium,
    );

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          buyerId: dto.buyerId,
          lotId: dto.lotId,
          buyerOrderId: dto.buyerOrderId,
          riceVariety: dto.riceVariety ?? lot.riceVariety,
          packaging: dto.packaging,
          quantityKg: dto.quantityKg,
          pricePerKg: dto.pricePerKg,
          fairtradePremium: premium || null,
          totalRevenue: gross,
          saleDate: new Date(dto.saleDate),
        },
      });
      if (dto.buyerOrderId) {
        const order = await tx.buyerOrder.findUnique({
          where: { id: dto.buyerOrderId },
          select: { quantityRequiredKg: true },
        });
        if (order) {
          const fulfilledKg = await tx.sale.aggregate({
            where: { buyerOrderId: dto.buyerOrderId },
            _sum: { quantityKg: true },
          });
          const totalFulfilled = fulfilledKg._sum.quantityKg ?? 0;
          await tx.buyerOrder.update({
            where: { id: dto.buyerOrderId },
            data: {
              status:
                totalFulfilled >= order.quantityRequiredKg
                  ? 'FULFILLED'
                  : 'PARTIALLY_FULFILLED',
            },
          });
        }
      }
      await tx.invoice.create({
        data: {
          invoiceNumber: `AR-${invoiceNumber}`,
          saleId: created.id,
          buyerId: dto.buyerId,
          amount: gross + premium,
          dueDate: new Date(new Date(dto.saleDate).getTime() + 30 * 86400000),
        },
      });
      if (premium > 0) {
        await tx.premiumFundEntry.create({
          data: {
            entryType: 'INCOME',
            amount: premium,
            description: `Fairtrade premium from sale ${invoiceNumber}`,
            saleId: created.id,
            entryDate: new Date(dto.saleDate),
          },
        });
      }
      for (const allocation of allocations) {
        const {
          farmerId,
          inventoryWeightKg,
          weightShare,
          quantityKg,
          grossAmount: farmerGross,
          fairtradePremium: farmerPremium,
        } = allocation;
        const revenue = await tx.revenue.create({
          data: {
            cropCycleId: cycleByFarmer.get(farmerId)!,
            revenueType: buyer.isCertified
              ? RevenueType.FAIRTRADE_SALE
              : RevenueType.CONVENTIONAL_SALE,
            quantityKg,
            pricePerKg: dto.pricePerKg,
            totalRevenue: farmerGross,
            fairtradePremium: farmerPremium || null,
            buyerId: dto.buyerId,
            saleId: created.id,
            saleDate: new Date(dto.saleDate),
          },
        });
        await tx.saleApportionment.create({
          data: {
            saleId: created.id,
            farmerId,
            inventoryWeightKg,
            weightShare,
            quantityKg,
            grossAmount: farmerGross,
            fairtradePremium: farmerPremium,
            revenueId: revenue.id,
          },
        });
        await tx.payment.create({
          data: {
            farmerId,
            saleId: created.id,
            amount: farmerGross,
            netAmount: farmerGross,
            paymentType: PaymentType.RICE_PURCHASE,
            status: PaymentStatus.PENDING,
            description: `Pending rice purchase payment for sale ${invoiceNumber}`,
          },
        });
        if (farmerPremium > 0) {
          await tx.payment.create({
            data: {
              farmerId,
              saleId: created.id,
              amount: farmerPremium,
              netAmount: farmerPremium,
              paymentType: PaymentType.FAIRTRADE_PREMIUM,
              status: PaymentStatus.PENDING,
              description: `Pending Fairtrade premium payment for sale ${invoiceNumber}`,
            },
          });
        }
      }
      await tx.inventoryRecord.updateMany({
        where: { lotNumber: lot.lotNumber },
        data: { status: 'SOLD' },
      });
      return tx.sale.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          buyer: true,
          lot: true,
          apportionments: {
            include: {
              farmer: {
                select: {
                  controlNumber: true,
                  firstName: true,
                  lastName: true,
                },
              },
              revenue: true,
            },
          },
          payments: true,
        },
      });
    });

    await Promise.all(
      sale.apportionments.map((allocation) =>
        this.activities.log(
          allocation.farmerId,
          'sale.apportioned',
          `Cooperative sale recorded: ${invoiceNumber}`,
          `TZS ${(allocation.grossAmount + allocation.fairtradePremium).toLocaleString()} pending payment`,
          '💰',
        ),
      ),
    );
    await this.accounting.postToLedger(
      'Sale',
      sale.id,
      sale.saleDate,
      `Sale ${sale.invoiceNumber}`,
      [
        {
          code: '1100',
          debit: sale.totalRevenue + (sale.fairtradePremium ?? 0),
        },
        { code: '4000', credit: sale.totalRevenue },
        ...(sale.fairtradePremium
          ? [{ code: '4100', credit: sale.fairtradePremium }]
          : []),
      ],
    );
    await Promise.all(
      sale.payments.map((payment) =>
        this.accounting.postToLedger(
          'Payment',
          payment.id,
          payment.createdAt,
          `Farmer payment obligation for ${sale.invoiceNumber}`,
          [
            { code: '5200', debit: payment.amount },
            { code: '2200', credit: payment.amount },
          ],
        ),
      ),
    );
    return sale;
  }

  async settle(id: string, paymentDate?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException(`Sale with ID ${id} not found`);
    if (sale.paymentReceived)
      throw new ConflictException('This sale is already settled');
    const settled = await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { saleId: id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.CLEARED,
          paidAt: new Date(paymentDate ?? Date.now()),
        },
      });
      return tx.sale.update({
        where: { id },
        data: {
          paymentReceived: true,
          paymentDate: new Date(paymentDate ?? Date.now()),
        },
        include: { payments: true },
      });
    });
    await this.loans.applyDeductionsForSale(id);
    await this.accounting.postToLedger(
      'SaleSettlement',
      id,
      settled.paymentDate!,
      `Buyer settlement for ${settled.invoiceNumber}`,
      [
        {
          code: '1000',
          debit: settled.totalRevenue + (settled.fairtradePremium ?? 0),
        },
        {
          code: '1100',
          credit: settled.totalRevenue + (settled.fairtradePremium ?? 0),
        },
      ],
    );
    await this.prisma.invoice.updateMany({
      where: { saleId: id, status: 'OPEN' },
      data: { status: 'PAID', paidAt: settled.paymentDate },
    });
    return settled;
  }

  async collectBuyerPayment(id: string, phoneNumber?: string) {
    if (!this.clickPesa.isConfigured())
      throw new ConflictException(
        'ClickPesa is not configured; buyer collection cannot be initiated.',
      );
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { buyer: true },
    });
    if (!sale) throw new NotFoundException(`Sale with ID ${id} not found`);
    if (sale.paymentReceived)
      throw new ConflictException('This sale is already settled');
    const payer = phoneNumber ?? sale.buyer.contactPhone;
    if (!payer)
      throw new BadRequestException(
        'A buyer mobile-money phone number is required',
      );
    const orderReference = `SALE-${sale.id.slice(0, 8)}-${Date.now()}`;
    const payment = await this.clickPesa.initiateUssdPush({
      amount: String(sale.totalRevenue + (sale.fairtradePremium ?? 0)),
      orderReference,
      phoneNumber: payer,
    });
    return this.prisma.sale.update({
      where: { id },
      data: {
        buyerOrderReference: orderReference,
        buyerPaymentReference: payment.id,
      },
    });
  }

  async reconcileBuyerPayment(orderReference: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { buyerOrderReference: orderReference },
    });
    if (!sale)
      throw new NotFoundException(
        'No cooperative sale found for this payment reference',
      );
    const status = await this.clickPesa.queryPayment(orderReference);
    if (!status || !['SUCCESS', 'SETTLED'].includes(status.status)) return sale;
    if (sale.paymentReceived) return sale;
    return this.settle(sale.id, new Date().toISOString());
  }

  async findOne(idOrInvoice: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { OR: [{ id: idOrInvoice }, { invoiceNumber: idOrInvoice }] },
      include: {
        buyer: true,
        lot: {
          include: {
            inventoryRecords: {
              include: {
                farmer: {
                  select: {
                    controlNumber: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                farm: {
                  select: {
                    id: true,
                    farmCode: true,
                    village: true,
                    ward: true,
                    district: true,
                    region: true,
                  },
                },
              },
            },
          },
        },
        apportionments: {
          include: {
            revenue: true,
            farmer: {
              select: { controlNumber: true, firstName: true, lastName: true },
            },
          },
        },
        payments: true,
        dispatch: {
          include: {
            releasedBy: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!sale)
      throw new NotFoundException(`Sale or invoice ${idOrInvoice} not found`);
    return sale;
  }

  async dispatchLookup(reference: string) {
    const sale = await this.findOne(reference);
    return {
      invoiceNumber: sale.invoiceNumber,
      saleDate: sale.saleDate,
      buyer: sale.buyer,
      riceVariety: sale.riceVariety,
      quantityKg: sale.quantityKg,
      packaging: sale.packaging,
      totalRevenue: sale.totalRevenue,
      paymentReceived: sale.paymentReceived,
      lot: { lotNumber: sale.lot.lotNumber },
      dispatch: sale.dispatch,
    };
  }

  async createDispatch(
    reference: string,
    dto: CreateDispatchDto,
    releasedByUserId: string,
  ) {
    const sale = await this.findOne(reference);
    if (sale.dispatch) {
      throw new ConflictException('This sale has already been dispatched');
    }

    const recordIds = sale.lot.inventoryRecords.map((r) => r.id);

    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          saleId: sale.id,
          transportMode: dto.transportMode,
          transportFee: dto.transportFee,
          vehiclePlateNumber: dto.vehiclePlateNumber,
          driverName: dto.driverName,
          driverPhone: dto.driverPhone,
          notes: dto.notes,
          releasedByUserId,
        },
        include: {
          releasedBy: { select: { firstName: true, lastName: true } },
        },
      });

      if (recordIds.length) {
        await tx.inventoryRecord.updateMany({
          where: { id: { in: recordIds }, status: { not: 'SHIPPED' } },
          data: { status: 'SHIPPED' },
        });
      }

      return dispatch;
    });
  }

  findAll() {
    return this.prisma.sale.findMany({
      include: {
        buyer: true,
        lot: true,
        _count: { select: { apportionments: true, payments: true } },
      },
      orderBy: { saleDate: 'desc' },
    });
  }

  async traceability(reference: string) {
    const trimmed = reference.trim();
    if (!trimmed) {
      throw new NotFoundException('Traceability reference is required');
    }

    // Prefer a completed sale chain when the reference resolves to one.
    let sale: Awaited<ReturnType<SalesService['findOne']>> | null = null;
    try {
      sale = await this.findOne(trimmed);
    } catch {
      const record = await this.prisma.inventoryRecord.findUnique({
        where: { trackingCode: trimmed },
        include: {
          lot: {
            include: { sales: { orderBy: { saleDate: 'desc' }, take: 1 } },
          },
        },
      });
      const lot =
        record?.lot ??
        (await this.prisma.lot.findFirst({
          where: { OR: [{ id: trimmed }, { lotNumber: trimmed }] },
          include: { sales: { orderBy: { saleDate: 'desc' }, take: 1 } },
        }));
      if (lot?.sales[0]) {
        sale = await this.findOne(lot.sales[0].id);
      } else if (lot || record) {
        // Pre-sale chain: lot and/or intake only.
        const inventoryRecords =
          lot?.id
            ? await this.prisma.inventoryRecord.findMany({
                where: { lotNumber: lot.lotNumber },
                include: {
                  farmer: {
                    select: {
                      id: true,
                      controlNumber: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                  farm: {
                    select: {
                      id: true,
                      farmCode: true,
                      village: true,
                      ward: true,
                      district: true,
                      region: true,
                    },
                  },
                  cropCycle: {
                    select: {
                      id: true,
                      season: true,
                      riceVariety: true,
                      status: true,
                      activities: {
                        orderBy: { activityDate: 'desc' },
                        take: 8,
                        select: {
                          id: true,
                          activityType: true,
                          activityDate: true,
                          description: true,
                        },
                      },
                    },
                  },
                },
              })
            : record
              ? [
                  await this.prisma.inventoryRecord.findUniqueOrThrow({
                    where: { id: record.id },
                    include: {
                      farmer: {
                        select: {
                          id: true,
                          controlNumber: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                      farm: {
                        select: {
                          id: true,
                          farmCode: true,
                          village: true,
                          ward: true,
                          district: true,
                          region: true,
                        },
                      },
                      cropCycle: {
                        select: {
                          id: true,
                          season: true,
                          riceVariety: true,
                          status: true,
                          activities: {
                            orderBy: { activityDate: 'desc' },
                            take: 8,
                            select: {
                              id: true,
                              activityType: true,
                              activityDate: true,
                              description: true,
                            },
                          },
                        },
                      },
                    },
                  }),
                ]
              : [];

        const preSaleSorter = lot
          ? await this.lotAiQuality(lot.id)
          : null;

        return {
          invoiceNumber: null,
          saleDate: null,
          paymentReceived: false,
          status: 'PRE_SALE',
          buyer: null,
          lot: lot
            ? {
                id: lot.id,
                lotNumber: lot.lotNumber,
                riceVariety: lot.riceVariety,
                totalWeightKg: lot.totalWeightKg,
                ...preSaleSorter,
              }
            : null,
          sourceRecords: inventoryRecords.map((r) => ({
            trackingCode: r.trackingCode,
            receivedDate: r.receivedDate,
            weightKg: r.weightKg,
            qualityGrade: r.qualityGrade,
            moistureContentPct: r.moistureContentPct,
            status: r.status,
            farm: r.farm,
            farmer: r.farmer,
            cropCycle: r.cropCycle,
          })),
          farmerAllocations: [],
        };
      } else {
        throw new NotFoundException(
          `No sale, lot, or inventory found for traceability reference ${trimmed}`,
        );
      }
    }

    const cycleIds = Array.from(
      new Set(
        sale.lot.inventoryRecords
          .map((r: any) => r.cropCycleId)
          .filter(Boolean) as string[],
      ),
    );
    const cycles =
      cycleIds.length > 0
        ? await this.prisma.cropCycle.findMany({
            where: { id: { in: cycleIds } },
            select: {
              id: true,
              season: true,
              riceVariety: true,
              status: true,
              farmId: true,
              farmerId: true,
              activities: {
                orderBy: { activityDate: 'desc' },
                take: 8,
                select: {
                  id: true,
                  activityType: true,
                  activityDate: true,
                  description: true,
                },
              },
            },
          })
        : [];
    const cycleById = new Map(cycles.map((c) => [c.id, c]));
    const lotQuality = await this.lotAiQuality(sale.lot.id);

    return {
      invoiceNumber: sale.invoiceNumber,
      saleDate: sale.saleDate,
      paymentReceived: sale.paymentReceived,
      status: sale.paymentReceived ? 'SETTLED' : 'SALE',
      buyer: sale.buyer,
      lot: {
        id: sale.lot.id,
        lotNumber: sale.lot.lotNumber,
        riceVariety: sale.lot.riceVariety,
        totalWeightKg: sale.lot.totalWeightKg,
        ...lotQuality,
      },
      sourceRecords: sale.lot.inventoryRecords.map((record: any) => ({
        trackingCode: record.trackingCode,
        receivedDate: record.receivedDate,
        weightKg: record.weightKg,
        qualityGrade: record.qualityGrade,
        moistureContentPct: record.moistureContentPct,
        status: record.status,
        farm: record.farm,
        farmer: record.farmer,
        cropCycle: record.cropCycleId
          ? cycleById.get(record.cropCycleId) ?? null
          : null,
      })),
      farmerAllocations: sale.apportionments,
    };
  }
}
