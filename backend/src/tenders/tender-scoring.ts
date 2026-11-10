/**
 * The evaluation engine. Every bid gets a score out of 100 from four things the tender fixed in advance (weights that add up
 * to 100): price, equipment offered, years of experience and past performance on MAYOData. Nothing here knows who the bidder is.
 */
export interface Weights { wPrice: number; wEquipment: number; wExperience: number; wPerformance: number }
export interface ScoreInput {
  id: string; price: number; equipmentOffered: number; yearsExperience: number;
  /** Average 1-5 rating from finished MAYOData contracts, or null when there are none yet. */
  pastRating: number | null; submittedAt: Date;
}
export interface Scored extends ScoreInput {
  rank: number; total: number;
  parts: { price: number; equipment: number; experience: number; performance: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Ten years of experience earns the full experience score. */
export const FULL_EXPERIENCE_YEARS = 10;
/** A contractor with no finished contract is scored at the middle on past performance: neither rewarded nor punished. */
export const NEUTRAL_PERFORMANCE = 0.5;

export function scoreBids(bids: ScoreInput[], tender: Weights & { requiredEquipment: number }): Scored[] {
  if (!bids.length) return [];
  const lowest = Math.min(...bids.map((b) => b.price));
  const scored = bids.map((b) => {
    const parts = {
      price: r2(tender.wPrice * (lowest / b.price)),
      equipment: r2(tender.wEquipment * Math.min(1, b.equipmentOffered / Math.max(1, tender.requiredEquipment))),
      experience: r2(tender.wExperience * Math.min(1, b.yearsExperience / FULL_EXPERIENCE_YEARS)),
      performance: r2(tender.wPerformance * (b.pastRating == null ? NEUTRAL_PERFORMANCE : b.pastRating / 5)),
    };
    return { ...b, parts, total: r2(parts.price + parts.equipment + parts.experience + parts.performance), rank: 0 };
  });
  // Highest score first; a tie goes to the lower price, then to whoever bid first.
  scored.sort((a, b) => b.total - a.total || a.price - b.price || +a.submittedAt - +b.submittedAt);
  scored.forEach((s, i) => { s.rank = i + 1; });
  return scored;
}
