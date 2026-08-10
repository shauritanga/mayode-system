import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { ActivitiesService } from '../activities/activities.service';
import { CreateInputCostDto, CreateRevenueDto } from './dto/finance.dto';
import { AccountingService } from '../accounting/accounting.service';

const CATEGORY_ICONS: Record<string, string> = {
  SEEDS: '🌱',
  FERTILIZER: '🧪',
  PESTICIDE: '🐛',
  HERBICIDE: '🌿',
  LABOR: '👷',
  TILLAGE: '🚜',
  IRRIGATION: '💧',
  TRANSPORT: '🚚',
  MISCELLANEOUS: '💵',
};

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly activities: ActivitiesService,
    private readonly accounting: AccountingService,
  ) {}

  /** Platform-wide input cost list for admin reporting (distribution status by category). */
  findAllInputCosts() {
    return this.prisma.inputCost.findMany({
      orderBy: { dateIncurred: 'desc' },
      include: {
        cropCycle: {
          select: {
            farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
          },
        },
      },
    });
  }

  private async findCropCycleOrFail(cropCycleId: string) {
    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      include: { farm: { select: { farmCode: true, farmerId: true } } },
    });
    if (!cropCycle) {
      throw new NotFoundException(
        `Crop Cycle with ID ${cropCycleId} not found`,
      );
    }
    return cropCycle;
  }

  /** Record an expense (owner comment: "record expenses" — a free feature). */
  async addInputCost(dto: CreateInputCostDto, user: RequestUser) {
    const cropCycle = await this.findCropCycleOrFail(dto.cropCycleId);
    await this.ownership.assertFarmAccess(user, cropCycle.farmId);

    const cost = await this.prisma.inputCost.create({
      data: {
        cropCycleId: dto.cropCycleId,
        category: dto.category,
        itemName: dto.itemName,
        quantity: dto.quantity,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        totalCost: dto.totalCost,
        supplier: dto.supplier,
        receiptUrl: dto.receiptUrl,
        dateIncurred: new Date(dto.dateIncurred),
      },
      include: {
        cropCycle: { select: { season: true, riceVariety: true } },
      },
    });

    await this.activities.log(
      cropCycle.farmerId,
      'expense.added',
      `Recorded expense: ${dto.itemName}`,
      `TZS ${dto.totalCost.toLocaleString()} · ${cropCycle.farm.farmCode}`,
      CATEGORY_ICONS[dto.category] ?? '💵',
    );
    await this.accounting.postToLedger('InputCost', cost.id, cost.dateIncurred, `Input cost: ${cost.itemName}`, [{ code: '5000', debit: cost.totalCost }, { code: '1000', credit: cost.totalCost }]);
    return cost;
  }

  /** A farmer records their own harvest sale, or staff records it on their behalf. */
  async addRevenue(dto: CreateRevenueDto, user: RequestUser) {
    const cropCycle = await this.findCropCycleOrFail(dto.cropCycleId);
    await this.ownership.assertFarmAccess(user, cropCycle.farmId);

    if (dto.buyerId) {
      const buyer = await this.prisma.buyer.findUnique({
        where: { id: dto.buyerId },
      });
      if (!buyer) {
        throw new NotFoundException(`Buyer with ID ${dto.buyerId} not found`);
      }
    }

    const revenue = await this.prisma.revenue.create({
      data: {
        cropCycleId: dto.cropCycleId,
        revenueType: dto.revenueType,
        quantityKg: dto.quantityKg,
        pricePerKg: dto.pricePerKg,
        totalRevenue: dto.totalRevenue,
        fairtradePremium: dto.fairtradePremium,
        buyerId: dto.buyerId,
        saleDate: new Date(dto.saleDate),
      },
      include: {
        cropCycle: { select: { season: true, riceVariety: true } },
        buyer: { select: { name: true, isCertified: true } },
      },
    });

    await this.activities.log(
      cropCycle.farmerId,
      'revenue.added',
      `Sale recorded: ${dto.quantityKg}kg`,
      `TZS ${dto.totalRevenue.toLocaleString()} · ${cropCycle.farm.farmCode}`,
      '💰',
    );
    await this.accounting.postToLedger('Revenue', revenue.id, revenue.saleDate, 'Recorded crop revenue', [{ code: '1000', debit: revenue.totalRevenue }, { code: '4000', credit: revenue.totalRevenue }]);
    return revenue;
  }

  async getCropCycleFinancialSummary(cropCycleId: string, user: RequestUser) {
    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      include: {
        costs: true,
        revenues: true,
        farm: { select: { farmCode: true, socialHectares: true } },
        farmer: {
          select: { controlNumber: true, firstName: true, lastName: true },
        },
      },
    });

    if (!cropCycle) {
      throw new NotFoundException(
        `Crop Cycle with ID ${cropCycleId} not found`,
      );
    }
    await this.ownership.assertFarmAccess(user, cropCycle.farmId);

    const totalCosts = cropCycle.costs.reduce(
      (sum, cost) => sum + cost.totalCost,
      0,
    );
    const totalRevenues = cropCycle.revenues.reduce(
      (sum, rev) => sum + rev.totalRevenue,
      0,
    );
    const totalFairtradePremium = cropCycle.revenues.reduce(
      (sum, rev) => sum + (rev.fairtradePremium || 0),
      0,
    );
    const netProfit = totalRevenues + totalFairtradePremium - totalCosts;

    const totalQuantitySoldKg = cropCycle.revenues.reduce(
      (sum, rev) => sum + rev.quantityKg,
      0,
    );
    const costPerKgProduced = cropCycle.actualYieldKg
      ? totalCosts / cropCycle.actualYieldKg
      : null;
    const avgRevenuePerKg = totalQuantitySoldKg
      ? totalRevenues / totalQuantitySoldKg
      : null;

    return {
      cropCycleId: cropCycle.id,
      season: cropCycle.season,
      riceVariety: cropCycle.riceVariety,
      farmCode: cropCycle.farm?.farmCode,
      farmerName: `${cropCycle.farmer?.firstName} ${cropCycle.farmer?.lastName}`,
      socialHectares: cropCycle.farm?.socialHectares,
      actualYieldKg: cropCycle.actualYieldKg,
      totalQuantitySoldKg,
      financials: {
        totalCosts,
        totalRevenues,
        totalFairtradePremium,
        netProfit,
        costPerKgProduced,
        avgRevenuePerKg,
        isProfitable: netProfit > 0,
      },
      costsDetail: cropCycle.costs,
      revenuesDetail: cropCycle.revenues,
    };
  }

  async getFarmerFinancialSummary(farmerId: string, user: RequestUser) {
    // Financial providers assess creditworthiness across farmers for loan decisions —
    // not restricted to "their own" farmer profile, since they aren't a farmer.
    if (user.role !== UserRole.FINANCIAL_PROVIDER) {
      await this.ownership.assertFarmerAccess(user, farmerId);
    }

    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        cropCycles: {
          include: {
            costs: true,
            revenues: true,
          },
        },
      },
    });

    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }

    let overallCosts = 0;
    let overallRevenues = 0;
    let overallFairtradePremium = 0;

    farmer.cropCycles.forEach((cycle) => {
      overallCosts += cycle.costs.reduce((sum, c) => sum + c.totalCost, 0);
      overallRevenues += cycle.revenues.reduce(
        (sum, r) => sum + r.totalRevenue,
        0,
      );
      overallFairtradePremium += cycle.revenues.reduce(
        (sum, r) => sum + (r.fairtradePremium || 0),
        0,
      );
    });

    const overallNetProfit =
      overallRevenues + overallFairtradePremium - overallCosts;

    return {
      farmerId: farmer.id,
      controlNumber: farmer.controlNumber,
      name: `${farmer.firstName} ${farmer.lastName}`,
      creditScore: farmer.creditScore,
      totalCropCycles: farmer.cropCycles.length,
      overallFinancials: {
        overallCosts,
        overallRevenues,
        overallFairtradePremium,
        overallNetProfit,
        isProfitable: overallNetProfit > 0,
      },
    };
  }
}
