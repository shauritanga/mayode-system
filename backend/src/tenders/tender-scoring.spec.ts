import { scoreBids } from './tender-scoring';

const tender = { requiredEquipment: 2, wPrice: 60, wEquipment: 15, wExperience: 10, wPerformance: 15 };
const bid = (id: string, price: number, equipmentOffered: number, yearsExperience: number, pastRating: number | null, minutes = 0) =>
  ({ id, price, equipmentOffered, yearsExperience, pastRating, submittedAt: new Date(Date.UTC(2026, 0, 1, 0, minutes)) });

describe('tender scoring', () => {
  it('gives the lowest price the full price score and others a share of it', () => {
    const [a, b] = scoreBids([bid('a', 100, 2, 10, 5), bid('b', 125, 2, 10, 5)], tender);
    expect(a.parts.price).toBe(60);
    expect(b.parts.price).toBe(48);
    expect(a.rank).toBe(1); expect(b.rank).toBe(2);
  });

  it('scores equipment against what the tender needs, experience out of ten years, and past rating out of five', () => {
    const [only] = scoreBids([bid('a', 100, 1, 5, 4)], tender);
    expect(only.parts).toEqual({ price: 60, equipment: 7.5, experience: 5, performance: 12 });
    expect(only.total).toBe(84.5);
    expect(scoreBids([bid('a', 100, 9, 40, 5)], tender)[0].total).toBe(100); // capped at the full weight
  });

  it('treats a contractor with no finished contract as average, not as zero', () => {
    expect(scoreBids([bid('a', 100, 2, 0, null)], tender)[0].parts.performance).toBe(7.5);
  });

  it('breaks a tie by the lower price, then by who bid first', () => {
    const tied = { requiredEquipment: 1, wPrice: 0, wEquipment: 50, wExperience: 50, wPerformance: 0 };
    expect(scoreBids([bid('dear', 200, 1, 10, null), bid('cheap', 100, 1, 10, null)], tied).map((s) => s.id)).toEqual(['cheap', 'dear']);
    expect(scoreBids([bid('late', 100, 1, 10, null, 5), bid('early', 100, 1, 10, null, 1)], tied).map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('a cheaper bid does not win if a dearer one is much better on merit', () => {
    const ranked = scoreBids([bid('cheap', 90, 0, 0, 1), bid('good', 100, 2, 10, 5)], tender);
    expect(ranked[0].id).toBe('good');
  });

  it('returns nothing for no bids', () => { expect(scoreBids([], tender)).toEqual([]); });
});
