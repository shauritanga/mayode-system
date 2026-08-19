import { Injectable, NotFoundException } from '@nestjs/common';
import { FarmGrade } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Grade multipliers derived from the business proposal's one concrete
 * example: Grade A suggests 2.5M, Grade B (baseline) 2.2M, Grade C 1.8M when
 * rice is 100,000/- per 100kg sack. Expressed as ratios to the Grade B
 * reference price.
 */
const GRADE_MULTIPLIER: Record<FarmGrade, number> = {
  A: 2500000 / 2200000, // ≈ 1.1364
  B: 1,
  C: 1800000 / 2200000, // ≈ 0.8182
};

/** Doc: 100,000/- per sack of rice → 2.2M TZS suggested rent (Grade B). */
const RICE_TO_REFERENCE_RATIO = 2200000 / 100000; // 22x
const FALLBACK_RICE_SACK_PRICE = 100000;

/**
 * Doc's multi-year example: Year 1 = 2,000,000/-, Year 2 = 2,200,000/- — a
 * flat 10%/year escalation for "Step-Up Pricing" leases.
 */
const STEP_UP_ANNUAL_INCREASE = 0.1;

export type RentSchedule =
  | { model: 'fixed' | 'step_up'; years: { year: number; amount: number }[] }
  | { model: 'rice_linked'; sacksEquivalent: number };

/**
 * Doc: Jan–May is the "Emergency Season" when owners need fast cash and are
 * more willing to accept a lower price; Jun–Dec is "High Demand Season".
 * NOTE: the doc doesn't give an exact season multiplier — this 5% discount
 * during the emergency window is a conservative placeholder pending a real
 * business number; it only affects the *suggested* price shown to the owner,
 * never an enforced price.
 */
const EMERGENCY_SEASON_MULTIPLIER = 0.95;

export type MarketGauge = 'above' | 'fair' | 'below';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private isEmergencySeason(date = new Date()): boolean {
    const month = date.getMonth() + 1; // 1-12
    return month >= 1 && month <= 5;
  }

  async getLatestRiceSackPrice(): Promise<number> {
    const latestRice = await this.prisma.marketPrice.findFirst({
      where: { commodity: 'rice_sack_100kg' },
      orderBy: { recordedAt: 'desc' },
    });
    return latestRice?.price ?? FALLBACK_RICE_SACK_PRICE;
  }

  /**
   * Build the per-year rent schedule for a multi-year lease at listing-creation
   * time. "fixed" repeats the same amount every year; "step_up" escalates 10%/
   * year (the doc's Year1→Year2 2.0M→2.2M example); "rice_linked" doesn't
   * precompute future years (rice prices aren't known yet) — it freezes a
   * sack-equivalent at today's rice price, and each year's amount is computed
   * live from the rice price current at payment time (see computeInstallmentAmount).
   */
  async buildRentSchedule(
    askingPrice: number,
    years: number,
    pricingModel?: string | null,
  ): Promise<RentSchedule> {
    if (pricingModel === 'rice_linked') {
      const riceSackPrice = await this.getLatestRiceSackPrice();
      const sacksEquivalent = Math.round(askingPrice / riceSackPrice);
      return { model: 'rice_linked', sacksEquivalent };
    }
    const model = pricingModel === 'step_up' ? 'step_up' : 'fixed';
    const yearAmounts = Array.from({ length: years }, (_, i) => ({
      year: i + 1,
      amount:
        model === 'step_up'
          ? Math.round(askingPrice * Math.pow(1 + STEP_UP_ANNUAL_INCREASE, i))
          : askingPrice,
    }));
    return { model, years: yearAmounts };
  }

  /** Amount due for a specific lease year, reading the frozen schedule or computing rice-linked rent live. */
  async computeInstallmentAmount(
    schedule: RentSchedule,
    yearNumber: number,
  ): Promise<number> {
    if (schedule.model === 'rice_linked') {
      const riceSackPrice = await this.getLatestRiceSackPrice();
      return Math.round(schedule.sacksEquivalent * riceSackPrice);
    }
    const entry = schedule.years.find((y) => y.year === yearNumber);
    if (!entry) {
      throw new Error(`No rent schedule entry for year ${yearNumber}`);
    }
    return entry.amount;
  }

  /**
   * Suggested rent for a farm, linked to the latest rice-sack market price
   * and adjusted for land grade and season, plus a market gauge comparing an
   * (optional) proposed asking price against recent comparable listings.
   */
  async computeSuggestedPrice(farmId: string, askingPrice?: number) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    const riceSackPrice = await this.getLatestRiceSackPrice();
    const referencePrice = riceSackPrice * RICE_TO_REFERENCE_RATIO;
    const gradeMultiplier = GRADE_MULTIPLIER[farm.grade];
    const seasonMultiplier = this.isEmergencySeason()
      ? EMERGENCY_SEASON_MULTIPLIER
      : 1;
    const suggestedPrice = Math.round(
      referencePrice * gradeMultiplier * seasonMultiplier,
    );

    const since = new Date(Date.now() - NINETY_DAYS_MS);
    const comparable = await this.prisma.landListing.findMany({
      where: {
        createdAt: { gte: since },
        farm: { grade: farm.grade, region: farm.region ?? undefined },
      },
      select: { askingPrice: true },
    });
    const comparableAvg =
      comparable.length > 0
        ? comparable.reduce((sum, l) => sum + l.askingPrice, 0) /
          comparable.length
        : suggestedPrice;

    let marketGauge: MarketGauge = 'fair';
    if (askingPrice != null) {
      if (askingPrice > comparableAvg * 1.1) marketGauge = 'above';
      else if (askingPrice < comparableAvg * 0.9) marketGauge = 'below';
    }

    return {
      suggestedPrice,
      marketGauge,
      comparableCount: comparable.length,
      comparableAvg: Math.round(comparableAvg),
      riceSackPrice,
      grade: farm.grade,
      isEmergencySeason: this.isEmergencySeason(),
    };
  }
}
