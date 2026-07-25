import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInputCostDto, CreateRevenueDto } from './dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async addInputCost(createInputCostDto: CreateInputCostDto) {
    const { cropCycleId, category, itemName, quantity, unit, unitPrice, totalCost, supplier, receiptUrl, dateIncurred } = createInputCostDto;

    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
    });

    if (!cropCycle) {
      throw new NotFoundException(`Crop Cycle with ID ${cropCycleId} not found`);
    }

    return this.prisma.inputCost.create({
      data: {
        cropCycleId,
        category,
        itemName,
        quantity,
        unit,
        unitPrice,
        totalCost,
        supplier,
        receiptUrl,
        dateIncurred: new Date(dateIncurred),
      },
      include: {
        cropCycle: { select: { season: true, riceVariety: true } },
      },
    });
  }

  async addRevenue(createRevenueDto: CreateRevenueDto) {
    const { cropCycleId, revenueType, quantityKg, pricePerKg, totalRevenue, fairtradePremium, buyerId, saleDate } = createRevenueDto;

    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
    });

    if (!cropCycle) {
      throw new NotFoundException(`Crop Cycle with ID ${cropCycleId} not found`);
    }

    if (buyerId) {
      const buyer = await this.prisma.buyer.findUnique({ where: { id: buyerId } });
      if (!buyer) {
        throw new NotFoundException(`Buyer with ID ${buyerId} not found`);
      }
    }

    return this.prisma.revenue.create({
      data: {
        cropCycleId,
        revenueType,
        quantityKg,
        pricePerKg,
        totalRevenue,
        fairtradePremium,
        buyerId,
        saleDate: new Date(saleDate),
      },
      include: {
        cropCycle: { select: { season: true, riceVariety: true } },
        buyer: { select: { name: true, isCertified: true } },
      },
    });
  }

  async getCropCycleFinancialSummary(cropCycleId: string) {
    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      include: {
        costs: true,
        revenues: true,
        farm: { select: { farmCode: true, socialHectares: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
      },
    });

    if (!cropCycle) {
      throw new NotFoundException(`Crop Cycle with ID ${cropCycleId} not found`);
    }

    const totalCosts = cropCycle.costs.reduce((sum, cost) => sum + cost.totalCost, 0);
    const totalRevenues = cropCycle.revenues.reduce((sum, rev) => sum + rev.totalRevenue, 0);
    const totalFairtradePremium = cropCycle.revenues.reduce((sum, rev) => sum + (rev.fairtradePremium || 0), 0);
    const netProfit = totalRevenues + totalFairtradePremium - totalCosts;

    const totalQuantitySoldKg = cropCycle.revenues.reduce((sum, rev) => sum + rev.quantityKg, 0);
    const costPerKgProduced = cropCycle.actualYieldKg ? totalCosts / cropCycle.actualYieldKg : null;
    const avgRevenuePerKg = totalQuantitySoldKg ? totalRevenues / totalQuantitySoldKg : null;

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

  async getFarmerFinancialSummary(farmerId: string) {
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
      overallRevenues += cycle.revenues.reduce((sum, r) => sum + r.totalRevenue, 0);
      overallFairtradePremium += cycle.revenues.reduce((sum, r) => sum + (r.fairtradePremium || 0), 0);
    });

    const overallNetProfit = overallRevenues + overallFairtradePremium - overallCosts;

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
